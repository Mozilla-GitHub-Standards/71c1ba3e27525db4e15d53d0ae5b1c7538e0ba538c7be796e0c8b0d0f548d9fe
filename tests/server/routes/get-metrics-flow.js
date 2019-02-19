/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
const {registerSuite} = intern.getInterface('object');
const assert = intern.getPlugin('chai').assert;
const proxyquire = require('proxyquire');
const sinon = require('sinon');
let instance, request, response, route, mocks, sandbox;

registerSuite('routes/get-metrics-flow', {
  before: function () {
    sandbox = sinon.sandbox.create();
    mocks = {
      amplitude: sandbox.spy(),
      config: {
        get (key) {
          switch (key) {
          case 'allowed_metrics_flow_cors_origins':
            return ['https://mozilla.org'];
          case 'flow_id_key':
            return 'foo';
          case 'flow_id_expiry':
            return 7200000;
          }
        }
      },
      flowEvent: {
        logFlowEvent: sandbox.spy()
      },
      log: {
        info: sandbox.spy()
      }
    };
    route = proxyquire('../../../server/lib/routes/get-metrics-flow', {
      '../amplitude': mocks.amplitude,
      '../flow-event': mocks.flowEvent,
      '../logging/log': () => mocks.log
    });
    instance = route(mocks.config);

    request = {
      headers: {}
    };
    response = {json: sandbox.spy()};
  },

  afterEach: function () {
    sandbox.resetHistory();
  },

  tests: {
    'route interface is correct': function () {
      assert.isFunction(route);
      assert.lengthOf(route, 1);
    },

    'instance interface is correct': function () {
      assert.isObject(instance);
      assert.lengthOf(Object.keys(instance), 4);
      assert.equal(instance.method, 'get');
      assert.equal(instance.path, '/metrics-flow');
      assert.isObject(instance.cors);
      assert.isFunction(instance.cors.origin);
      assert.equal(instance.cors.methods, 'GET');
      assert.isFunction(instance.process);
      assert.lengthOf(instance.process, 2);
    },

    'response.json was called correctly': function () {
      instance.process(request, response);
      assert.equal(response.json.callCount, 1);
      const args = response.json.args[0];
      assert.lengthOf(args, 1);
      assert.ok(args[0].flowBeginTime);
      assert.ok(args[0].flowId);

      assert.equal(mocks.flowEvent.logFlowEvent.callCount, 1);
      const argsFlowEvent = mocks.flowEvent.logFlowEvent.args[0];
      assert.equal(argsFlowEvent.length, 3);
    },

    'supports query params and logs begin amplitude and flow events': function () {
      request = {
        headers: {},
        query: {
          entrypoint: 'zoo',
          'form_type': 'other',
          'service': 'sync',
          'utm_campaign': 'foo',
          'utm_content': 'bar',
          'utm_medium': 'biz',
          'utm_source': 'baz',
          'utm_term': 'quix',
        }
      };
      instance.process(request, response);

      assert.isFalse(mocks.log.info.called);

      assert.equal(mocks.amplitude.callCount, 1);
      let args = mocks.amplitude.args[0];
      assert.equal(args.length, 3);
      assert.ok(args[0].flowTime);
      assert.ok(args[0].time);
      assert.equal(args[0].type, 'flow.begin');
      assert.equal(args[2].entrypoint, 'zoo');
      assert.ok(args[2].flowId);
      assert.ok(args[2].deviceId);
      assert.notEqual(args[2].deviceId, args[2].flowId);

      assert.equal(mocks.flowEvent.logFlowEvent.callCount, 1);
      args = mocks.flowEvent.logFlowEvent.args[0];
      const eventData = args[0];
      const metricsData = args[1];
      assert.ok(eventData.flowTime);
      assert.ok(eventData.time);
      assert.equal(eventData.type, 'flow.begin');
      assert.equal(metricsData.entrypoint, 'zoo');
      assert.ok(metricsData.flowId);
      assert.ok(metricsData.deviceId);
    },

    'logs invalid entrypoint query parameter': function() {
      request = {
        headers: {},
        query: {
          entrypoint: 'foo bar',
          'form_type': 'email',
          'utm_campaign': 'biz',
          'utm_source': 'baz',
        }
      };
      instance.process(request, response);
      assert.isTrue(mocks.log.info.calledOnceWith({
        op: 'request.metrics-flow.invalid-param',
        param: 'entrypoint',
        value: 'foo bar',
      }));
      assert.isTrue(response.json.calledOnce);
    },

    'logs invalid form_type query parameter': function() {
      request = {
        headers: {},
        query: {
          entrypoint: 'bar',
          'form_type': 'biz',
          'utm_campaign': 'biz',
          'utm_source': 'baz',
        }
      };
      instance.process(request, response);
      assert.isTrue(mocks.log.info.calledOnceWith({
        op: 'request.metrics-flow.invalid-param',
        param: 'form_type',
        value: 'biz',
      }));
      assert.isTrue(response.json.calledOnce);
    },

    'logs invalid service query parameter': function() {
      request = {
        headers: {},
        query: {
          entrypoint: 'bar',
          'form_type': 'email',
          'service': 'zzzz',
          'utm_campaign': 'biz',
          'utm_source': 'baz',
        }
      };
      instance.process(request, response);
      assert.isTrue(mocks.log.info.calledOnceWith({
        op: 'request.metrics-flow.invalid-param',
        param: 'service',
        value: 'zzzz',
      }));
      assert.isTrue(response.json.calledOnce);
    },

    'logs invalid utm_campaign query parameter': function() {
      request = {
        headers: {},
        query: {
          entrypoint: 'bar',
          'form_type': 'email',
          'utm_campaign': 1,
          'utm_source': 'baz',
        }
      };
      instance.process(request, response);
      assert.isTrue(mocks.log.info.calledOnceWith({
        op: 'request.metrics-flow.invalid-param',
        param: 'utm_campaign',
        value: 1,
      }));
      assert.isTrue(response.json.calledOnce);
    },

    'logs invalid utm_content query parameter': function() {
      request = {
        headers: {},
        query: {
          entrypoint: 'bar',
          'form_type': 'email',
          'utm_campaign': 'biz',
          'utm_content': 'qux qux',
          'utm_source': 'baz',
        }
      };
      instance.process(request, response);
      assert.isTrue(mocks.log.info.calledOnceWith({
        op: 'request.metrics-flow.invalid-param',
        param: 'utm_content',
        value: 'qux qux',
      }));
      assert.isTrue(response.json.calledOnce);
    },

    'logs invalid utm_medium query parameter': function() {
      request = {
        headers: {},
        query: {
          entrypoint: 'bar',
          'form_type': 'email',
          'utm_campaign': 'biz',
          'utm_medium': 'wimble!@$',
          'utm_source': 'baz',
        }
      };
      instance.process(request, response);
      assert.isTrue(mocks.log.info.calledOnceWith({
        op: 'request.metrics-flow.invalid-param',
        param: 'utm_medium',
        value: 'wimble!@$'
      }));
      assert.isTrue(response.json.calledOnce);
    },

    'logs invalid utm_source query parameter': function() {
      request = {
        headers: {},
        query: {
          entrypoint: 'bar',
          'form_type': 'email',
          'utm_campaign': 'biz',
          'utm_source': '%!@%womble'
        }
      };
      instance.process(request, response);
      assert.isTrue(mocks.log.info.calledOnceWith({
        op: 'request.metrics-flow.invalid-param',
        param: 'utm_source',
        value: '%!@%womble',
      }));
      assert.isTrue(response.json.calledOnce);
    },

    'logs invalid utm_term query parameter': function() {
      request = {
        headers: {},
        query: {
          entrypoint: 'bar',
          'form_type': 'email',
          'utm_campaign': 'biz',
          'utm_source': 'baz',
          'utm_term': 'jum!%^gle'
        }
      };
      instance.process(request, response);
      assert.isTrue(mocks.log.info.calledOnceWith({
        op: 'request.metrics-flow.invalid-param',
        param: 'utm_term',
        value: 'jum!%^gle',
      }));
      assert.isTrue(response.json.calledOnce);
    },

    'logs enter-email.view amplitude and flow events if form_type email is set': function () {
      request = {
        headers: {},
        query: {
          entrypoint: 'bar',
          'form_type': 'email',
          'service': 'sync',
          'utm_campaign': 'foo',
          'utm_content': 'bar',
          'utm_medium': 'biz',
          'utm_source': 'baz',
          'utm_term': 'quix',
        }
      };
      instance.process(request, response);

      assert.isFalse(mocks.log.info.called);

      assert.equal(mocks.amplitude.callCount, 2);
      let args = mocks.amplitude.args[1];
      assert.equal(args.length, 3);
      assert.ok(args[0].flowTime);
      assert.ok(args[0].time);
      assert.equal(args[0].type, 'screen.enter-email');
      assert.equal(args[2].entrypoint, 'bar');
      assert.ok(args[2].flowId);

      assert.equal(mocks.flowEvent.logFlowEvent.callCount, 2);
      args = mocks.flowEvent.logFlowEvent.args[1];
      const eventData = args[0];
      const metricsData = args[1];
      assert.ok(eventData.flowTime);
      assert.ok(eventData.time);
      assert.equal(eventData.type, 'flow.enter-email.view');
      assert.equal(metricsData.entrypoint, 'bar');
      assert.ok(metricsData.flowId);
    },

    'validates CORS': function () {
      const dfd = this.async(1000);
      const corsFunc = instance.cors.origin;

      corsFunc('https://google.com', (err, result) => {
        assert.equal(err.message, 'CORS Error');
        assert.equal(result, null);
        corsFunc('https://mozilla.org', (err, result) => {
          assert.equal(err, null);
          assert.equal(result, true);
          dfd.resolve();
        });
      });

      return dfd;
    }
  }
});
