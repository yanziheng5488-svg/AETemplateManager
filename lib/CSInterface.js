(function (global) {
  'use strict';

  function cep() {
    return global.__adobe_cep__;
  }

  function CSInterface() {}

  CSInterface.prototype.evalScript = function (script, callback) {
    var api = cep();
    if (!api || typeof api.evalScript !== 'function') {
      if (callback) callback('EvalScript_ErrMessage: CEP runtime unavailable');
      return;
    }
    api.evalScript(script, callback || function () {});
  };

  CSInterface.prototype.getSystemPath = function (pathType) {
    var api = cep();
    return api && api.getSystemPath ? api.getSystemPath(pathType) : '';
  };

  CSInterface.prototype.addEventListener = function (type, listener) {
    var api = cep();
    if (api && api.addEventListener) api.addEventListener(type, listener);
  };

  CSInterface.prototype.removeEventListener = function (type, listener) {
    var api = cep();
    if (api && api.removeEventListener) api.removeEventListener(type, listener);
  };

  CSInterface.prototype.closeExtension = function () {
    var api = cep();
    if (api && api.closeExtension) api.closeExtension();
  };

  global.CSInterface = CSInterface;
})(typeof window !== 'undefined' ? window : this);
