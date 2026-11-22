// The Remeha Home API client on a fake fetch: the login of the app (cookies,
// CSRF, PKCE, code), the tokens (reuse, refresh, new login), the errors
// (refused credentials, 401, 429, problem details, network), the spacing of
// the requests, the bodies of the writes. Never the network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  CredentialsError,
  RateLimitError,
  ApiError,
  NetworkError,
  MIN_INTERVAL_MS,
  RATE_LIMIT_WAIT_MS,
  SUBSCRIPTION_KEY,
  CLIENT_ID,
  problemDetail,
  dayParameter,
  createRemehaApi,
} from '../src/remeha-api.js';
import { apiWithFetch, loginThen, TOKENS, LOGIN_PAGE, DASHBOARD } from './helpers/fixtures.js';

const EMAIL = 'me@example.com';
const PASSWORD = 'p@ss word';
const dashboard = () => ({ status: 200, body: DASHBOARD });
const form = (init) => Object.fromEntries(new URLSearchParams(init.body));
const isApi = (request) => request.url.startsWith('https://api.bdrthermea.net/');

test('without credentials: no request, MISSING', async () => {
  const { api, fetch } = apiWithFetch(() => ({ status: 500 }));
  assert.equal(api.hasCredentials(), false);
  await assert.rejects(
    api.getDashboard(),
    (err) => err instanceof CredentialsError && err.reason === 'MISSING',
  );
  assert.equal(fetch.requests.length, 0);
});

test('the login of the app: page, credentials with the CSRF and cookies, code, tokens', async () => {
  const { api, fetch } = apiWithFetch(loginThen(dashboard));
  api.setCredentials(EMAIL, PASSWORD);
  const body = await api.getDashboard();
  assert.equal(body.appliances.length, 1);
  const [page, asserted, confirmed, token, call] = fetch.requests;

  const authorize = new URL(page.url);
  assert.equal(authorize.searchParams.get('client_id'), CLIENT_ID);
  assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(authorize.searchParams.get('redirect_uri'), 'com.b2c.remehaapp://login-callback');
  assert.match(authorize.searchParams.get('scope'), /offline_access/);

  assert.equal(asserted.method, 'POST');
  assert.equal(asserted.headers['X-CSRF-TOKEN'], 'csrf-1');
  assert.match(asserted.headers.Cookie, /x-ms-cpim-csrf=csrf-1/);
  assert.match(asserted.headers.Cookie, /x-ms-cpim-trans=trans-1/);
  // The transaction of the page.
  assert.equal(new URL(asserted.url).searchParams.get('tx'), 'StateProperties=abc');
  assert.deepEqual(form(asserted), {
    request_type: 'RESPONSE',
    signInName: EMAIL,
    password: PASSWORD,
  });

  assert.equal(new URL(confirmed.url).searchParams.get('csrf_token'), 'csrf-1');
  assert.equal(confirmed.redirect, 'manual');

  const grant = form(token);
  assert.equal(grant.grant_type, 'authorization_code');
  assert.equal(grant.code, 'code-1');
  assert.equal(grant.client_id, CLIENT_ID);
  // The verifier matches the challenge sent first.
  assert.equal(
    createHash('sha256').update(grant.code_verifier).digest('base64url'),
    authorize.searchParams.get('code_challenge'),
  );

  assert.ok(isApi(call));
  assert.equal(call.headers.Authorization, 'Bearer access-1');
  assert.equal(call.headers['Ocp-Apim-Subscription-Key'], SUBSCRIPTION_KEY);
  assert.match(call.url, /\/homes\/dashboard\?t=\d+$/);
});

test('without a transaction id in the page, the one built from the request id', async () => {
  const handler = loginThen(dashboard);
  const { api, fetch } = apiWithFetch((url, init, n) =>
    url.includes('/authorize') ? { ...LOGIN_PAGE, text: '<html></html>' } : handler(url, init, n),
  );
  api.setCredentials(EMAIL, PASSWORD);
  await api.getDashboard();
  const tx = new URL(fetch.requests[1].url).searchParams.get('tx');
  const expected = Buffer.from(JSON.stringify({ TID: 'request-1' })).toString('base64url');
  assert.equal(tx, `StateProperties=${expected}`);
});

test('a login page without CSRF: a clear error, no credentials sent', async () => {
  const { api, fetch } = apiWithFetch(() => ({ status: 200, text: '<html></html>' }));
  api.setCredentials(EMAIL, PASSWORD);
  await assert.rejects(
    api.getDashboard(),
    (err) => err instanceof ApiError && /login page changed/.test(err.message),
  );
  assert.equal(fetch.requests.length, 1);
});

test('wrong e-mail or password: BAD_CREDENTIALS, the password never in the error', async () => {
  const { api } = apiWithFetch(
    loginThen(dashboard, {
      asserted: {
        status: 200,
        body: { status: '400', errorCode: 'AADB2C90053', message: 'Invalid username or password.' },
      },
    }),
  );
  api.setCredentials(EMAIL, PASSWORD);
  await assert.rejects(api.getDashboard(), (err) => {
    assert.ok(err instanceof CredentialsError);
    assert.equal(err.reason, 'BAD_CREDENTIALS');
    assert.doesNotMatch(err.message, /p@ss|me@example/);
    return true;
  });
});

test('another refusal of the login keeps its B2C code', async () => {
  const { api } = apiWithFetch(
    loginThen(dashboard, {
      asserted: { status: 200, body: { status: '400', errorCode: 'AADB2C90225' } },
    }),
  );
  api.setCredentials(EMAIL, PASSWORD);
  await assert.rejects(api.getDashboard(), (err) => err.reason === 'AADB2C90225');
});

test('no code in the redirect: the error of B2C, never a crash', async () => {
  const handler = loginThen(dashboard);
  const { api } = apiWithFetch((url, init, n) =>
    url.includes('/confirmed')
      ? {
          status: 302,
          headers: { location: 'com.b2c.remehaapp://login-callback?error=access_denied' },
        }
      : handler(url, init, n),
  );
  api.setCredentials(EMAIL, PASSWORD);
  await assert.rejects(
    api.getDashboard(),
    (err) => err instanceof ApiError && /access_denied/.test(err.message),
  );
});

test('the token is reused, then renewed with the refresh token near its end', async () => {
  let issued = 0;
  const { api, fetch, clock } = apiWithFetch(
    loginThen(dashboard, {
      token: () => {
        issued += 1;
        return TOKENS(issued);
      },
    }),
  );
  api.setCredentials(EMAIL, PASSWORD);
  await api.getDashboard();
  await api.getDashboard();
  assert.equal(fetch.requests.filter((r) => r.url.includes('/authorize')).length, 1);
  clock.now += 59 * 60 * 1000;
  await api.getDashboard();
  const tokenCalls = fetch.requests.filter((r) => r.url.includes('/token'));
  assert.equal(tokenCalls.length, 2);
  assert.deepEqual(
    [form(tokenCalls[1]).grant_type, form(tokenCalls[1]).refresh_token],
    ['refresh_token', 'refresh-1'],
  );
  assert.equal(fetch.requests.at(-1).headers.Authorization, 'Bearer access-2');
  assert.equal(fetch.requests.filter((r) => r.url.includes('/authorize')).length, 1);
});

test('a refused refresh token (400 invalid_grant): a new login with the password', async () => {
  let issued = 0;
  const { api, fetch, clock } = apiWithFetch(
    loginThen(dashboard, {
      token: (init) => {
        if (form(init).grant_type === 'refresh_token') {
          return { status: 400, body: { error: 'invalid_grant' } };
        }
        issued += 1;
        return TOKENS(issued);
      },
    }),
  );
  api.setCredentials(EMAIL, PASSWORD);
  await api.getDashboard();
  clock.now += 2 * 60 * 60 * 1000;
  await api.getDashboard();
  assert.equal(fetch.requests.filter((r) => r.url.includes('/authorize')).length, 2);
  assert.equal(fetch.requests.at(-1).headers.Authorization, 'Bearer access-2');
});

test('a 401 of the API renews the token once, then gives up', async () => {
  let refused = 0;
  const { api } = apiWithFetch(
    loginThen(() => {
      refused += 1;
      return {
        status: 401,
        body: { statusCode: 401, message: 'Unauthorized. Access token is missing or invalid.' },
      };
    }),
  );
  api.setCredentials(EMAIL, PASSWORD);
  await assert.rejects(
    api.getDashboard(),
    (err) => err instanceof CredentialsError && err.reason === 'UNAUTHORIZED',
  );
  assert.equal(refused, 2);
});

test('a 401 then a success: one renewal, the call succeeds', async () => {
  let calls = 0;
  const { api } = apiWithFetch(
    loginThen(() => {
      calls += 1;
      return calls === 1 ? { status: 401, body: {} } : dashboard();
    }),
  );
  api.setCredentials(EMAIL, PASSWORD);
  const body = await api.getDashboard();
  assert.equal(body.appliances.length, 1);
});

test('429: RateLimitError with Retry-After, or 5 minutes', async () => {
  const one = apiWithFetch(loginThen(() => ({ status: 429, headers: { 'retry-after': '120' } })));
  one.api.setCredentials(EMAIL, PASSWORD);
  await assert.rejects(
    one.api.getDashboard(),
    (err) => err instanceof RateLimitError && err.retryAfterMs === 120000,
  );
  const two = apiWithFetch(loginThen(() => ({ status: 429 })));
  two.api.setCredentials(EMAIL, PASSWORD);
  await assert.rejects(two.api.getDashboard(), (err) => err.retryAfterMs === RATE_LIMIT_WAIT_MS);
});

test('a refused request: the message of the problem details', async () => {
  const { api } = apiWithFetch(
    loginThen(() => ({
      status: 400,
      body: {
        title: 'Bad Request',
        status: 400,
        errors: { '': ['Zone must be of type Tank to do this process.'] },
      },
    })),
  );
  api.setCredentials(EMAIL, PASSWORD);
  await assert.rejects(api.setHotWaterComfort('d1', 50), (err) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 400);
    assert.equal(err.detail, 'Zone must be of type Tank to do this process.');
    return true;
  });
});

test('problemDetail reads errors, detail, message or title', () => {
  assert.equal(problemDetail({ errors: { a: ['x', 'y'] } }), 'x y');
  assert.equal(problemDetail({ title: 'Bad Request' }), 'Bad Request');
  assert.equal(problemDetail({ message: 'Unauthorized.' }), 'Unauthorized.');
  assert.equal(problemDetail(null), '');
  assert.equal(problemDetail({ title: 'x'.repeat(300) }).length, 120);
});

test('the service unreachable: NetworkError, without the URL', async () => {
  const api = createRemehaApi({
    fetchImpl: async () => {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
    },
    sleep: async () => {},
  });
  api.setCredentials(EMAIL, PASSWORD);
  await assert.rejects(
    api.getDashboard(),
    (err) => err instanceof NetworkError && /ENOTFOUND/.test(err.message),
  );
});

test('the API requests are spaced, one at a time', async () => {
  const { api, clock } = apiWithFetch(loginThen(dashboard));
  api.setCredentials(EMAIL, PASSWORD);
  await Promise.all([api.getDashboard(), api.getDashboard(), api.getDashboard()]);
  assert.deepEqual(clock.slept, [MIN_INTERVAL_MS, MIN_INTERVAL_MS]);
  assert.ok(api.requestsLastHour() >= 7);
});

test('new credentials drop the tokens: the next call logs in again', async () => {
  const { api, fetch } = apiWithFetch(loginThen(dashboard));
  api.setCredentials(EMAIL, PASSWORD);
  await api.getDashboard();
  api.setCredentials(EMAIL, PASSWORD);
  await api.getDashboard();
  assert.equal(fetch.requests.filter((r) => r.url.includes('/authorize')).length, 1, 'same: kept');
  api.setCredentials('other@example.com', PASSWORD);
  await api.getDashboard();
  assert.equal(fetch.requests.filter((r) => r.url.includes('/authorize')).length, 2);
});

test('the writes: routes and bodies of the app', async () => {
  const { api, fetch } = apiWithFetch(loginThen(() => ({ status: 200, text: '' })));
  api.setCredentials(EMAIL, PASSWORD);
  await api.setZoneSchedule('c1', 2);
  await api.setZoneTemporary('c1', 21.5);
  await api.setZoneTemporary('c1', 22, '2026-11-15T10:40:00Z');
  await api.setZoneManual('c1', 19);
  await api.setZoneOff('c1');
  await api.activateProgram('c1', 3);
  await api.setFireplace('c1', true);
  await api.setHotWaterMode('d1', 'boost');
  await api.setHotWaterComfort('d1', 55);
  await api.setHoliday('a1', '2026-11-15', '2026-11-22');
  await api.setHoliday('a1', null, null);
  await assert.rejects(api.setHotWaterMode('d1', 'party'), RangeError);
  const writes = fetch.requests
    .filter(isApi)
    .map((r) => [
      r.method,
      r.url.replace('https://api.bdrthermea.net/Mobile/api', ''),
      r.body ? JSON.parse(r.body) : null,
    ]);
  assert.deepEqual(writes, [
    ['POST', '/climate-zones/c1/modes/schedule', { heatingProgramId: 2 }],
    ['POST', '/climate-zones/c1/modes/temporary-override', { roomTemperatureSetPoint: 21.5 }],
    [
      'POST',
      '/climate-zones/c1/modes/temporary-override',
      { roomTemperatureSetPoint: 22, endTime: '2026-11-15T10:40:00Z' },
    ],
    ['POST', '/climate-zones/c1/modes/manual', { roomTemperatureSetPoint: 19 }],
    ['POST', '/climate-zones/c1/modes/anti-frost', null],
    ['POST', '/climate-zones/c1/time-programs/heating/3/activate', null],
    ['POST', '/climate-zones/c1/modes/fireplacemode', { fireplaceModeActive: true }],
    ['POST', '/hot-water-zones/d1/modes/boost', null],
    ['POST', '/hot-water-zones/d1/comfort-setpoint', { comfortSetpoint: 55 }],
    [
      'POST',
      '/appliances/a1/holidayschedule',
      { holidayModeStartTime: '2026-11-15T00:00:00Z', holidayModeEndTime: '2026-11-22T00:00:00Z' },
    ],
    [
      'POST',
      '/appliances/a1/holidayschedule',
      { holidayModeStartTime: '0001-01-01T00:00:00Z', holidayModeEndTime: '0001-01-01T00:00:01Z' },
    ],
  ]);
});

test('the daily energy asks for whole days with the Z of the app', async () => {
  const { api, fetch } = apiWithFetch(loginThen(() => ({ status: 200, body: { data: [] } })));
  api.setCredentials(EMAIL, PASSWORD);
  await api.getDailyEnergy('a 1', '2026-11-07', '2026-11-15');
  const url = new URL(fetch.requests.at(-1).url);
  assert.equal(url.pathname, '/Mobile/api/appliances/a%201/energyconsumption/daily');
  assert.equal(url.searchParams.get('startDate'), '2026-11-07 00:00:00.000Z');
  assert.equal(url.searchParams.get('endDate'), '2026-11-15 23:59:59.000Z');
  assert.equal(dayParameter('2026-01-01', true), '2026-01-01 23:59:59.000Z');
});
