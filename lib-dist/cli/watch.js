'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _extends2 = require('babel-runtime/helpers/extends');

var _extends3 = _interopRequireDefault(_extends2);

var _stringify = require('babel-runtime/core-js/json/stringify');

var _stringify2 = _interopRequireDefault(_stringify);

var _asyncToGenerator2 = require('babel-runtime/helpers/asyncToGenerator');

var _asyncToGenerator3 = _interopRequireDefault(_asyncToGenerator2);

var _reduce2 = require('lodash/reduce');

var _reduce3 = _interopRequireDefault(_reduce2);

var _activityLogger = require('activity-logger');

var _activityLogger2 = _interopRequireDefault(_activityLogger);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _hapi = require('hapi');

var _hapi2 = _interopRequireDefault(_hapi);

var _boom = require('boom');

var _boom2 = _interopRequireDefault(_boom);

var _inert = require('inert');

var _inert2 = _interopRequireDefault(_inert);

var _chokidar = require('chokidar');

var _chokidar2 = _interopRequireDefault(_chokidar);

var _constants = require('../constants');

var _constants2 = _interopRequireDefault(_constants);

var _log = require('../log');

var _log2 = _interopRequireDefault(_log);

var _index = require('../index');

var _index2 = _interopRequireDefault(_index);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// Given an obj it'll prune any properites that start with `_`.
function prunePrivateProperties(obj) {
  let isPrivate = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : (val, key) => key[0] === '_';

  return (0, _reduce3.default)(obj, (acc, val, key) => {
    if (!isPrivate(val, key)) {
      acc[key] = val;
    }
    return acc;
  }, {});
}

function debounceFunction(fn) {
  return function () {
    if (fn.running) {
      return;
    }
    fn.running = true;
    fn.apply(undefined, arguments).then(() => {
      fn.running = false;
    });
  };
}

class Server {
  constructor(reptar) {
    var _this = this;

    this.routeHandler = (() => {
      var _ref = (0, _asyncToGenerator3.default)(function* (request, reply) {
        const isDebug = request.query.debug != null;

        const file = _this.getFile(request.path);

        if (file.assetProcessor) {
          const content = yield file.render();
          const contentType = request.server.mime.path(request.path).type;
          return reply(content).type(contentType);
        }

        // If this File does not require any processing then it's a static asset
        // and we can just render it.
        if (file.skipProcessing) {
          return reply.file(file.path);
        }

        // Update the File/CollectionPage from disk.
        yield file.update(_this.reptar.metadata.get());

        // We need to make sure we run all middleware and lifecycle hooks on
        // every render to ensure you get an accurate representation of your site.
        yield _this.reptar.update({ skipFiles: true });

        // Render the File/CollectionPage.
        const content = yield file.render(_this.reptar.metadata.get());

        // If we want debug information then render the JSON version.
        if (isDebug) {
          // Exclude private fields from being returned.
          const debugFile = prunePrivateProperties(file);
          return reply((0, _stringify2.default)(debugFile)).type('application/json');
        }

        _log2.default.info(`Rendering ${file.id}`);

        return reply(content);
      });

      return function (_x2, _x3) {
        return _ref.apply(this, arguments);
      };
    })();

    this.reptar = reptar;

    this.server = new _hapi2.default.Server();

    this.server.connection({
      host: reptar.config.get('server.host'),
      port: reptar.config.get('server.port')
    });
  }

  /**
   * Starts the Hapi server.
   * @return {Promise}
   */
  start() {
    var _this2 = this;

    return (0, _asyncToGenerator3.default)(function* () {
      yield _this2.server.register([_inert2.default]);

      _this2.server.route({
        method: 'GET',
        path: '/{p*}',
        handler: function (request, reply) {
          _this2.routeHandler(request, reply).catch(function (e) {
            reply(_boom2.default.badData(e.message));
          });
        }
      });

      _this2.createFsWatchers();

      // Start the server
      return _this2.server.start();
    })();
  }

  /**
   * Get File/CollectionPage based on request.path.
   * @param {string} requestPath Request path to server.
   * @return {File|CollectionPage}
   */
  getFile(requestPath) {
    let file = this.reptar.destination[requestPath];
    if (!file) {
      file = this.reptar.destination[_path2.default.join(requestPath, 'index.html')];
    }
    return file;
  }

  /**
   * Our default route handler for every request.
   * @param {Object} request Hapi Request object.
   * @param {Object} reply Hapi Response object.
   * @return {Promise}
   */


  /**
   * Create file system watchers to update Reptar state according to when a
   * user updates files.
   */
  createFsWatchers() {
    var _this3 = this;

    _chokidar2.default.watch([_path2.default.join(this.reptar.config.root, _constants2.default.ConfigFilename)]).on('change', debounceFunction((() => {
      var _ref2 = (0, _asyncToGenerator3.default)(function* (changePath) {
        _log2.default.info(`${_constants2.default.ConfigFilename} updated at ${changePath}`);

        try {
          yield _this3.reptar.update();
        } catch (e) {
          _log2.default.error(e);
        }
      });

      return function (_x4) {
        return _ref2.apply(this, arguments);
      };
    })()));

    _chokidar2.default.watch([this.reptar.config.get('path.data')]).on('change', debounceFunction((() => {
      var _ref3 = (0, _asyncToGenerator3.default)(function* (changePath) {
        _log2.default.info(`Data updated at ${changePath}`);

        try {
          yield _this3.reptar.update();
        } catch (e) {
          _log2.default.error(e);
        }
      });

      return function (_x5) {
        return _ref3.apply(this, arguments);
      };
    })()));
  }
}

exports.default = (() => {
  var _ref4 = (0, _asyncToGenerator3.default)(function* () {
    let options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

    const startActivity = _activityLogger2.default.start('Starting watch.\t\t\t\t');

    const reptar = new _index2.default((0, _extends3.default)({
      // Turn off caching of templates.
      noTemplateCache: true,
      showSpinner: false
    }, options));

    yield reptar.update();

    const server = new Server(reptar);
    yield server.start();

    _activityLogger2.default.end(startActivity);

    process.stdout.write('\n');
    _log2.default.info('Server running at:', server.server.info.uri);
  });

  function watch() {
    return _ref4.apply(this, arguments);
  }

  return watch;
})();