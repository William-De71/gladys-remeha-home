// -----------------------------------------------------------------------------
// Client of the Remeha Home API, the cloud of BDR Thermea behind the Remeha
// Home app (also used by Baxi, De Dietrich and Brötje appliances). BDR Thermea
// publishes no documentation: the routes, fields and the login below are the
// ones the community integrations for Home Assistant use and describe (see
// NOTICE). The login answers were checked against the real service.
//
// Login (Azure AD B2C, the flow of the app, with PKCE):
//   GET  {LOGIN}/oauth2/v2.0/authorize?…            login page: cookies, csrf, transaction id
//   POST {LOGIN}/{policy}/SelfAsserted?tx=…         e-mail + password
//        -> HTTP 200 `{"status":"200"}`, or `{"status":"400","errorCode":"AADB2C90053",
//           "message":"Invalid username or password."}` (checked)
//   GET  {LOGIN}/{policy}/api/CombinedSigninAndSignup/confirmed   302 to the app with `code`
//   POST {LOGIN}/oauth2/v2.0/token                  code or refresh token -> tokens
//        -> a refused refresh token: 400 `{"error":"invalid_grant"}` (checked)
//
// API ({API}, headers `Authorization: Bearer …` and the subscription key of the app):
//   GET  /homes/dashboard                                         every appliance and zone
//   GET  /appliances/{id}/technicaldetails                        model name, gateways
//   GET  /appliances/{id}/energyconsumption/daily?startDate&endDate
//   POST /appliances/{id}/holidayschedule                         holiday period
//   POST /climate-zones/{id}/modes/schedule | temporary-override | manual | anti-frost | fireplacemode
//   POST /climate-zones/{id}/time-programs/heating/{n}/activate   clock program 1 to 3
//   POST /hot-water-zones/{id}/modes/schedule | continuous-comfort | anti-frost | boost
//   POST /hot-water-zones/{id}/comfort-setpoint
//   -> a missing or refused token: 401 `{"statusCode":401,"message":"Unauthorized. …"}` (checked);
//      a refused request: 4xx with a problem details body (`errors`).
//
// - Requests go one at a time, a short pause apart: the API is not public,
//   the integration stays as discreet as the app.
// - The password and the tokens live in memory only: never logged, never in
//   /data, never in an error message. After a restart the integration logs in
//   again.
// -----------------------------------------------------------------------------

import { createHash, randomBytes } from 'node:crypto';

const LOGIN_URL = 'https://remehalogin.bdrthermea.net/bdrb2cprod.onmicrosoft.com';
const API_URL = 'https://api.bdrthermea.net/Mobile/api';
const POLICY = 'B2C_1A_RPSignUpSignInNewRoomV3.1';
// The pages of the policy use this spelling (lower-case v), as the app does.
const POLICY_PATH = 'B2C_1A_RPSignUpSignInNewRoomv3.1';
const CLIENT_ID = '6ce007c6-0628-419e-88f4-bee2e6418eec';
const REDIRECT_URI = 'com.b2c.remehaapp://login-callback';
const SCOPE =
  'openid https://bdrb2cprod.onmicrosoft.com/iotdevice/user_impersonation offline_access';
// The key the Remeha Home app sends to the API gateway (public, in the app).
const SUBSCRIPTION_KEY = 'df605c5470d846fc91e848b1cc653ddf';
// Two requests to the API are this far apart at least.
const MIN_INTERVAL_MS = 500;
const TIMEOUT_MS = 20 * 1000;
// A 429 without Retry-After asks to wait this long.
const RATE_LIMIT_WAIT_MS = 5 * 60 * 1000;
// A token is renewed this long before it expires.
const TOKEN_MARGIN_MS = 2 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** The e-mail / password pair is refused, or the login cannot complete. */
class CredentialsError extends Error {
  /**
   * @param {string} reason - MISSING, BAD_CREDENTIALS, UNAUTHORIZED, or a B2C code.
   * @param {number|null} status - HTTP status.
   */
  constructor(reason, status = null) {
    super(`Remeha refused the credentials (${reason})`);
    this.name = 'CredentialsError';
    this.reason = reason;
    this.status = status;
  }
}

/** Remeha asks to slow down (429). */
class RateLimitError extends Error {
  /** @param {number} retryAfterMs - The wait before the next request. */
  constructor(retryAfterMs) {
    super('Remeha limits the requests');
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

/** Any other HTTP error of the API or of the login. */
class ApiError extends Error {
  /**
   * @param {number} status - HTTP status.
   * @param {string} [detail] - A short detail, free of any secret.
   */
  constructor(status, detail = '') {
    super(`Remeha API error ${status}${detail ? ` (${detail})` : ''}`);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

/** The service cannot be reached (DNS, timeout, connection refused). */
class NetworkError extends Error {
  /** @param {string} message - What failed (never a URL with a secret). */
  constructor(message) {
    super(`Remeha unreachable: ${message}`);
    this.name = 'NetworkError';
  }
}

/**
 * @description The message of a problem details body ("Start Date must be
 * before the End Date."), or of another error body.
 * @param {unknown} body - The parsed answer.
 * @returns {string} The message, 120 characters at most ('' when none).
 */
function problemDetail(body) {
  if (!body || typeof body !== 'object') return '';
  const messages = [];
  if (body.errors && typeof body.errors === 'object') {
    for (const value of Object.values(body.errors)) {
      if (Array.isArray(value)) messages.push(...value.map(String));
      else if (typeof value === 'string') messages.push(value);
    }
  }
  const text =
    messages.join(' ') ||
    [body.detail, body.message, body.title, body.error].find((v) => typeof v === 'string') ||
    '';
  return text.replace(/\s+/g, ' ').trim().slice(0, 120);
}

/**
 * @description The Retry-After of an answer, in ms.
 * @param {Headers} headers - The headers.
 * @returns {number} The wait (RATE_LIMIT_WAIT_MS when absent).
 */
function retryAfter(headers) {
  const seconds = Number(headers?.get?.('retry-after'));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : RATE_LIMIT_WAIT_MS;
}

/**
 * @description A day as the energy routes want it: `YYYY-MM-DD HH:mm:ss.000Z`
 * (the API reads it as a time of the appliance despite the Z).
 * @param {string} day - `YYYY-MM-DD`.
 * @param {boolean} end - The last second of the day.
 * @returns {string} The parameter.
 */
const dayParameter = (day, end) => `${day} ${end ? '23:59:59' : '00:00:00'}.000Z`;

/**
 * @description Create a Remeha Home API client.
 * @param {object} [options] - Options.
 * @param {Function} [options.fetchImpl] - `fetch` (tests).
 * @param {Function} [options.now] - `() => ms` (tests).
 * @param {Function} [options.sleep] - `(ms) => Promise` (tests).
 * @param {Function} [options.random] - `(bytes) => Buffer` (tests).
 * @param {number} [options.minIntervalMs] - Spacing of two API requests.
 * @param {number} [options.timeoutMs] - Timeout of a request.
 * @param {string} [options.userAgent] - User-Agent header.
 * @returns {object} The client.
 * @example
 * const api = createRemehaApi();
 * api.setCredentials('me@example.com', 'password');
 * const dashboard = await api.getDashboard();
 */
function createRemehaApi({
  fetchImpl = (...args) => fetch(...args),
  now = () => Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random = (bytes) => randomBytes(bytes),
  minIntervalMs = MIN_INTERVAL_MS,
  timeoutMs = TIMEOUT_MS,
  userAgent = 'gladys-remeha-home',
} = {}) {
  let email = '';
  let password = '';
  // { access, refresh, expiresAt }
  let tokens = null;
  let session = null;
  // Bumped by setCredentials: a login started with old credentials is dropped.
  let generation = 0;
  let queue = Promise.resolve();
  let nextSlot = 0;
  const sentAt = [];

  /** @description Forget the requests older than an hour. */
  function prune() {
    const limit = now() - HOUR_MS;
    while (sentAt.length && sentAt[0] < limit) sentAt.shift();
  }

  /**
   * @description One HTTP exchange (never throws on an HTTP status).
   * @param {string} url - The URL.
   * @param {object} init - fetch options.
   * @returns {Promise<{status: number, headers: Headers, text: string, body: unknown}>} The answer.
   */
  async function exchange(url, init) {
    sentAt.push(now());
    prune();
    let response;
    try {
      response = await fetchImpl(url, {
        redirect: 'manual',
        ...init,
        headers: { 'User-Agent': userAgent, ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const reason = err?.name === 'TimeoutError' ? 'timeout' : (err?.cause?.code ?? 'network');
      throw new NetworkError(reason);
    }
    const text = await response.text().catch(() => '');
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }
    return { status: response.status, headers: response.headers, text, body };
  }

  /**
   * @description Run a task in the queue, a pause after the previous one.
   * @param {Function} task - `() => Promise`.
   * @returns {Promise<unknown>} Its result.
   */
  function enqueue(task) {
    const run = async () => {
      const wait = nextSlot - now();
      if (wait > 0) await sleep(wait);
      try {
        return await task();
      } finally {
        nextSlot = now() + minIntervalMs;
      }
    };
    const result = queue.then(run, run);
    queue = result.catch(() => {});
    return result;
  }

  /**
   * @description Store the tokens of a token answer.
   * @param {object} answer - The answer of the token endpoint.
   */
  function takeTokens(answer) {
    const body = answer.body ?? {};
    if (typeof body.access_token !== 'string' || !body.access_token) {
      throw new ApiError(answer.status, 'no token in the answer');
    }
    const lifetime = Number(body.expires_in);
    tokens = {
      access: body.access_token,
      refresh:
        typeof body.refresh_token === 'string' && body.refresh_token
          ? body.refresh_token
          : (tokens?.refresh ?? null),
      expiresAt: now() + (Number.isFinite(lifetime) && lifetime > 0 ? lifetime * 1000 : HOUR_MS),
    };
  }

  /**
   * @description Call the token endpoint.
   * @param {object} grant - The form fields.
   * @returns {Promise<object>} The answer.
   */
  function requestToken(grant) {
    return exchange(`${LOGIN_URL}/oauth2/v2.0/token?p=${POLICY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ ...grant, client_id: CLIENT_ID }).toString(),
    });
  }

  /** @description The full login of the app: e-mail and password, then tokens. */
  async function login() {
    if (!email || !password) throw new CredentialsError('MISSING');
    const jar = new Map();
    const keep = (headers) => {
      const list = headers?.getSetCookie?.() ?? [];
      for (const raw of list) {
        const pair = raw.split(';')[0];
        const at = pair.indexOf('=');
        if (at > 0) jar.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
      }
    };
    const cookies = () => [...jar].map(([key, value]) => `${key}=${value}`).join('; ');

    const verifier = random(48).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: SCOPE,
      state: random(16).toString('base64url'),
      code_challenge: challenge,
      code_challenge_method: 'S256',
      p: POLICY,
      brand: 'remeha',
      lang: 'en',
      nonce: 'defaultNonce',
      prompt: 'login',
      signUp: 'False',
    });
    const page = await exchange(`${LOGIN_URL}/oauth2/v2.0/authorize?${query}`, { method: 'GET' });
    if (page.status === 429) throw new RateLimitError(retryAfter(page.headers));
    if (page.status !== 200) throw new ApiError(page.status, 'login page');
    keep(page.headers);
    const csrf = jar.get('x-ms-cpim-csrf') ?? /"csrf"\s*:\s*"([^"]+)"/.exec(page.text)?.[1];
    // The transaction: from the page, else built from the request id as the app does.
    const requestId = page.headers.get('x-request-id');
    const transaction =
      /"transId"\s*:\s*"([^"]+)"/.exec(page.text)?.[1] ??
      (requestId
        ? `StateProperties=${Buffer.from(JSON.stringify({ TID: requestId })).toString('base64url')}`
        : null);
    if (!csrf || !transaction) throw new ApiError(page.status, 'login page changed');

    const tx = encodeURIComponent(transaction);
    const asserted = await exchange(
      `${LOGIN_URL}/${POLICY_PATH}/SelfAsserted?tx=${tx}&p=${POLICY_PATH}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-CSRF-TOKEN': csrf,
          'X-Requested-With': 'XMLHttpRequest',
          Cookie: cookies(),
        },
        body: new URLSearchParams({
          request_type: 'RESPONSE',
          signInName: email,
          password,
        }).toString(),
      },
    );
    if (asserted.status === 429) throw new RateLimitError(retryAfter(asserted.headers));
    if (asserted.status !== 200) throw new ApiError(asserted.status, 'login');
    keep(asserted.headers);
    if (String(asserted.body?.status) !== '200') {
      const code = String(asserted.body?.errorCode ?? '').slice(0, 20);
      // AADB2C90053: wrong e-mail or password; anything else (locked account,
      // password to reset) is refused too, with its code.
      throw new CredentialsError(
        !code || code === 'AADB2C90053' ? 'BAD_CREDENTIALS' : code,
        asserted.status,
      );
    }

    const confirmed = await exchange(
      `${LOGIN_URL}/${POLICY_PATH}/api/CombinedSigninAndSignup/confirmed?${new URLSearchParams({
        rememberMe: 'false',
        csrf_token: csrf,
        tx: transaction,
        p: POLICY_PATH,
      })}`,
      { method: 'GET', headers: { Cookie: cookies() } },
    );
    const location = confirmed.headers.get('location') ?? '';
    let code;
    try {
      code = new URL(location).searchParams.get('code');
    } catch {
      code = null;
    }
    if (!code) {
      const error = /[?&]error=([^&]+)/.exec(location)?.[1];
      throw new ApiError(
        confirmed.status,
        error ? `login ${decodeURIComponent(error)}` : 'no login code',
      );
    }

    const answer = await requestToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    });
    if (answer.status === 429) throw new RateLimitError(retryAfter(answer.headers));
    if (answer.status >= 400)
      throw new ApiError(answer.status, String(answer.body?.error ?? 'token'));
    takeTokens(answer);
  }

  /** @description Renew the access token with the refresh token, else log in again. */
  async function renew() {
    if (tokens?.refresh) {
      const answer = await requestToken({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh,
      });
      if (answer.status === 429) throw new RateLimitError(retryAfter(answer.headers));
      if (answer.status < 400) {
        takeTokens(answer);
        return;
      }
      // An expired or revoked refresh token (400 invalid_grant): log in again.
      tokens = null;
    }
    await login();
  }

  /** @description A valid access token (shared by concurrent callers). */
  async function ensureToken() {
    if (tokens?.access && now() < tokens.expiresAt - TOKEN_MARGIN_MS) return;
    if (!session) {
      const started = generation;
      session = renew()
        .then(() => {
          // Credentials changed meanwhile: these tokens belong to the old ones.
          if (started !== generation) tokens = null;
        })
        .finally(() => {
          session = null;
        });
    }
    await session;
    if (!tokens?.access) throw new CredentialsError('UNAUTHORIZED');
  }

  /**
   * @description Call a route of the API (in the queue).
   * @param {string} method - GET or POST.
   * @param {string} path - The path after the API URL.
   * @param {object} [payload] - The JSON body.
   * @returns {Promise<unknown>} The parsed answer.
   */
  function call(method, path, payload) {
    return enqueue(async () => {
      for (let renewed = false; ; renewed = true) {
        await ensureToken();
        const answer = await exchange(`${API_URL}${path}`, {
          method,
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${tokens.access}`,
            'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
            ...(payload !== undefined ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
        });
        if (answer.status === 429) throw new RateLimitError(retryAfter(answer.headers));
        if (answer.status === 401) {
          // A refused token: renew once, then give up.
          if (tokens) tokens.expiresAt = 0;
          if (renewed) throw new CredentialsError('UNAUTHORIZED', answer.status);
          continue;
        }
        if (answer.status >= 400) throw new ApiError(answer.status, problemDetail(answer.body));
        return answer.body;
      }
    });
  }

  const id = (value) => encodeURIComponent(String(value));
  const post = (path, payload) => call('POST', path, payload);
  const DHW_MODES = ['schedule', 'continuous-comfort', 'anti-frost', 'boost'];

  return {
    /**
     * @description Use these credentials from now on (drops the tokens).
     * @param {string} mail - The e-mail of the Remeha Home account.
     * @param {string} secret - Its password.
     */
    setCredentials(mail, secret) {
      const changed = (mail ?? '') !== email || (secret ?? '') !== password;
      email = mail ?? '';
      password = secret ?? '';
      if (changed) {
        tokens = null;
        generation += 1;
      }
    },
    hasCredentials: () => Boolean(email && password),
    /** @returns {Promise<object>} The dashboard (`{ appliances: [...] }`). */
    getDashboard: async () =>
      (await call('GET', `/homes/dashboard?t=${Math.floor(now() / 1000)}`)) ?? {},
    /**
     * @param {string} applianceId - The appliance.
     * @returns {Promise<object>} `{ applianceName, internetConnectedGateways }`.
     */
    getTechnicalDetails: async (applianceId) =>
      (await call('GET', `/appliances/${id(applianceId)}/technicaldetails`)) ?? {},
    /**
     * @description The energy of each day from `from` to `to` (days of the appliance).
     * @param {string} applianceId - The appliance.
     * @param {string} from - `YYYY-MM-DD`.
     * @param {string} to - `YYYY-MM-DD`.
     * @returns {Promise<object>} `{ data: [...] }`.
     */
    getDailyEnergy: async (applianceId, from, to) =>
      (await call(
        'GET',
        `/appliances/${id(applianceId)}/energyconsumption/daily?${new URLSearchParams({
          startDate: dayParameter(from, false),
          endDate: dayParameter(to, true),
        })}`,
      )) ?? {},
    /**
     * @description Schedule a holiday (whole days), or cancel it (`null`, `null`).
     * @param {string} applianceId - The appliance.
     * @param {string|null} from - First day `YYYY-MM-DD`.
     * @param {string|null} to - The day of return `YYYY-MM-DD`.
     * @returns {Promise<void>}
     */
    async setHoliday(applianceId, from, to) {
      await post(`/appliances/${id(applianceId)}/holidayschedule`, {
        holidayModeStartTime: from ? `${from}T00:00:00Z` : '0001-01-01T00:00:00Z',
        holidayModeEndTime: to ? `${to}T00:00:00Z` : '0001-01-01T00:00:01Z',
      });
    },
    /**
     * @param {string} zoneId - The climate zone.
     * @param {number} program - Its active clock program (1 to 3).
     * @returns {Promise<void>}
     */
    async setZoneSchedule(zoneId, program) {
      await post(`/climate-zones/${id(zoneId)}/modes/schedule`, { heatingProgramId: program });
    },
    /**
     * @param {string} zoneId - The climate zone.
     * @param {number} setpoint - °C.
     * @param {string|null} [endTime] - The end, ISO UTC (null: next switch of the program).
     * @returns {Promise<void>}
     */
    async setZoneTemporary(zoneId, setpoint, endTime = null) {
      await post(`/climate-zones/${id(zoneId)}/modes/temporary-override`, {
        roomTemperatureSetPoint: setpoint,
        ...(endTime ? { endTime } : {}),
      });
    },
    /**
     * @param {string} zoneId - The climate zone.
     * @param {number} setpoint - °C.
     * @returns {Promise<void>}
     */
    async setZoneManual(zoneId, setpoint) {
      await post(`/climate-zones/${id(zoneId)}/modes/manual`, {
        roomTemperatureSetPoint: setpoint,
      });
    },
    /** @param {string} zoneId - The climate zone. @returns {Promise<void>} */
    async setZoneOff(zoneId) {
      await post(`/climate-zones/${id(zoneId)}/modes/anti-frost`);
    },
    /**
     * @param {string} zoneId - The climate zone.
     * @param {number} program - 1 to 3.
     * @returns {Promise<void>}
     */
    async activateProgram(zoneId, program) {
      await post(`/climate-zones/${id(zoneId)}/time-programs/heating/${id(program)}/activate`);
    },
    /**
     * @param {string} zoneId - The climate zone.
     * @param {boolean} active - On or off.
     * @returns {Promise<void>}
     */
    async setFireplace(zoneId, active) {
      await post(`/climate-zones/${id(zoneId)}/modes/fireplacemode`, {
        fireplaceModeActive: active,
      });
    },
    /**
     * @param {string} zoneId - The hot water zone.
     * @param {string} mode - schedule, continuous-comfort, anti-frost or boost.
     * @returns {Promise<void>}
     */
    async setHotWaterMode(zoneId, mode) {
      if (!DHW_MODES.includes(mode)) throw new RangeError(`Unknown hot water mode ${mode}`);
      await post(`/hot-water-zones/${id(zoneId)}/modes/${mode}`);
    },
    /**
     * @param {string} zoneId - The hot water zone.
     * @param {number} setpoint - °C.
     * @returns {Promise<void>}
     */
    async setHotWaterComfort(zoneId, setpoint) {
      await post(`/hot-water-zones/${id(zoneId)}/comfort-setpoint`, { comfortSetpoint: setpoint });
    },
    /** @returns {number} Requests sent during the last hour. */
    requestsLastHour() {
      prune();
      return sentAt.length;
    },
  };
}

export {
  LOGIN_URL,
  API_URL,
  POLICY,
  POLICY_PATH,
  CLIENT_ID,
  SUBSCRIPTION_KEY,
  MIN_INTERVAL_MS,
  RATE_LIMIT_WAIT_MS,
  CredentialsError,
  RateLimitError,
  ApiError,
  NetworkError,
  problemDetail,
  dayParameter,
  createRemehaApi,
};
