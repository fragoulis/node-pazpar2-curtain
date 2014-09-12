'use strict';

var Pazpar2 = require('pazpar2')
  , util = require('util')
  , xml = require('xml2js')
  , q = require('q')
  ;

/**
 * Helper class.
 * 
 * @param {[type]}   interval [description]
 * @param {Function} callback [description]
 */
var Interval = function(interval) 
{
  var id;

  this.begin = function(callback) {
    if (id)
      return;

    id = setInterval(callback, interval);
  }

  this.end = function() {
    clearInterval(id);
    id = null;
  }
};

/**
 * The show command's result object.
 */
var ShowObject = function(result) 
{
  this.status = result.status[0];
  this.activeclients = parseInt(result.activeclients[0]);
  this.merged = parseInt(result.merged[0]);
  this.total = parseInt(result.total[0]);
  this.start = parseInt(result.start[0]);
  this.num = parseInt(result.num[0]);
  this.hit = [];

  for(var idxHit in result.hit) {
    var newHit = {}
      , oldHit = result.hit[idxHit];

    newHit.title = oldHit['md-title'][0];
    newHit.author = oldHit['md-author_070'];
    newHit.publisher = oldHit['md-author_650'];
    newHit.year = oldHit['md-year'][0];
    newHit.count = parseInt(oldHit.count[0]);
    newHit.relevance = parseInt(oldHit.relevance[0]);
    newHit.recid = oldHit.recid[0];
    newHit.recno = parseInt(oldHit.location[0]['md-recno'][0]);
    newHit.holdings = [];

    for(var idxLoc in oldHit.location) {
      var holding = {}
        , location = oldHit.location[idxLoc];

      holding.source = location.$.id;
      holding.checksum = location.$.checksum;
      holding.digital = location['md-digital'];

      newHit.holdings.push(holding);
    }

    this.hit.push(newHit);
  }
};

/**
 * The stat command's result object.
 */
var StatObject = function(result) 
{
  this.activeclients = parseInt(result.activeclients[0]);
  this.hits = parseInt(result.hits[0]);
  this.records = parseInt(result.records[0]);
  this.clients = parseInt(result.clients[0]);
  this.unconnected = parseInt(result.unconnected[0]);
  this.connecting = parseInt(result.connecting[0]);
  this.working = parseInt(result.working[0]);
  this.idle = parseInt(result.idle[0]);
  this.failed = parseInt(result.failed[0]);
  this.error = parseInt(result.error[0]);
  this.progress = parseFloat(result.progress[0]);
};

/**
 * The termlist command's result object.
 */
var TermListObject = function(result) 
{
  for(var idx in result.termlist.list) {
    var termName = result.termlist.list[idx].$.name
      , items = result.termlist.list[idx].term;

    this[termName] = {
      type: termName,
      terms: []
    };

    for(var idxItem in items) {
      this[termName].terms.push({
        name: items[idxItem].name[0],
        freq: parseInt(items[idxItem].frequency[0])
      });
    }
  }
};

/**
 * Curtain is a wrapper of the Pazpar2 package that provides
 * a simpler interface for the client to use when searching.
 *
 * The interface mainly consists of the init() and the search()
 * methods.
 * It also provides pagination mechanism.
 *
 * @version 0.1.0
 */
var Curtain = function(options) 
{
  options = options || {};

  this.session = options.session || null;
  this.createdAt = null;
  this.updatedAt = null;

  this.pingInterval = 5000;
  this.statInterval = new Interval(options.statInterval || 1000);
  this.showInterval = new Interval(options.showInterval || 1000);
  this.termlistInterval = new Interval(options.termlistInterval || 1000);
  this.searching = false;

  this.pz2 = new Pazpar2(options.pazpar2 || {});
};

Curtain.ERR_INVALID_SESSION = 1;
Curtain.ERR_MISSING_RECORD  = 7;
Curtain.ERR_INVALID_RECORD_OFFSET = 10;

/**
 * Parses a pazpar2 server response and returns a JSON document.
 * 
 * @param  {String} result The XML response
 * @return {Object}        The JSON document
 */
var parseXmlResponse = function(result, callback, errorCallback) 
{
  xml.parseString(result, function(err, data) 
  {
    if (err) { // XML parsing error
      throw new Error(err);
    } else if(data.error) { // Pazpar2 error
      if (errorCallback) {
        errorCallback(parseInt(data.error.$.code), data.error.$.msg);
      }
    } else {
      callback(data);
    }
  });
};

/**
 * A wrapper for ping that makes sense when checking 
 * to see if a session is alive.
 * 
 * @return {Promise}
 */
var isSessionValid = function()
{
  var self = this;

  // Returns a promise that can only resolve. Anything other than
  // a successfull call with a valid session should resolve to false.
  return q.Promise(function(resolve) {

    // Ping the server to see if the session is valid
    return self.ping()
      .then(function(result) {
        resolve(true);
      }, function(e) {
        resolve(false);
      });
  });
}; // isSessionValid


var errorHandler = function(reject) {
  return function(code, msg) {
    reject({code: code, msg: msg, session: this.session});
  };
};


/**
 * Creates a new session and updates the member session.
 * @return {Promise}
 */
var innerInit = function()
{
  var self = this;
  return q.Promise(function(resolve, reject) {
    self.pz2.init().then(function(result) {
      
      parseXmlResponse(result, function(data) {
        var newSession = data.init.session[0];
        self.session = newSession;
        resolve(newSession);
      }, function(code, msg) {
        reject({code: code, msg: msg, session: self.session});
      });

    }, reject);
  });
} // innerInit

/**
 * Checks current session for validity and if not valid it
 * creates a new one.
 * 
 * @return {Promise}
 */
var safeInit = function()
{
  var self = this;
  return q.Promise(function(resolve, reject) {
    
    isSessionValid.call(self).then(function(isValid) {

      if (isValid) {
        resolve();
      } else {
        return innerInit.call(self).then(resolve, reject);
      }

    });

  });
} // safeInit


/**
 * Init wrapper.
 * 
 * @param  {Object} options  Options are:
 *                           `safe`: if true, the method guarantees a valid session.
 *                           
 * @return {Promise}         [description]
 */
Curtain.prototype.init = function(options) 
{
  options = options || {
      session: null
    , safe: false
  };

  if(options.session && options.safe === true) {
    this.session = options.session;
    return safeInit.call(this);
  } else {
    return innerInit.call(this);
  }
};

/**
 * Raw ping wrapper.
 * @return {Promise}
 */
Curtain.prototype.ping = function() 
{
  var self = this;
  return q.Promise(function(resolve, reject) {

    return self.pz2.ping(self.session)
      .then(function(result) {

        var data = parseXmlResponse(result, function(data) {
          resolve(data);
        }, function(code, msg) {
            reject(msg);
        });

      }, reject);

  });
};

/**
 * Calls the stat command every X seconds until the server
 * is not working anymore.
 * 
 * @return {Promise}
 */
var promiseStat = function(progress) 
{
  var self = this;
  return q.Promise(function(resolve, reject) {

    self.statInterval.begin(function() {
      
      self.pz2.stat(self.session).then(function(result) {
        
        parseXmlResponse(result, function(data) {
          var stat = new StatObject(data.stat);

          progress(stat);

          if (stat.working == 0) {
            self.statInterval.end();          
            resolve(stat);
          }
            
        }, function(code, msg) {
          reject(new Error(msg));
        });
        
      }, function(err) {
        reject(err);
      });

    });

  });
};

/**
 * [promiseShow description]
 * @return {[type]} [description]
 */
var promiseShow = function() 
{
  var self = this;
  return q.Promise(function(resolve, reject) {

    self.showInterval.begin(function() {
      
      self.pz2.show(self.session).then(function(result) {

        // console.log(result.toString());
        parseXmlResponse(result, function(data) {
          if (data.show.activeclients == 0) {
            self.showInterval.end();
            resolve(new ShowObject(data.show));
          }
        }, function(code, msg) {
          reject(new Error(msg));
        });

      }, function(err) {
        reject(err);
      });

    });

  });
};

/**
 * [promiseTermlist description]
 * @return {[type]} [description]
 */
var promiseTermlist = function(terms) 
{
  var self = this;
  return q.Promise(function(resolve, reject) {

    if (terms === undefined || terms.length === 0) {
      return resolve({});
    }

    self.termlistInterval.begin(function() {
      
      self.pz2.termlist(self.session).then(function(result) {

        parseXmlResponse(result, function(data) {
          if (data.termlist.activeclients == 0) {
            self.termlistInterval.end();
            resolve(new TermListObject(data));
          }
        }, function(code, msg) {
          reject(new Error(msg));
        });
        
      }, function(err) {
        reject(err);
      });

    });

  });
};

/**
 * Search wrapper.
 * 
 * @param  {[type]} ccl    [description]
 * @param  {[type]} filter [description]
 * @return {[type]}        [description]
 */
Curtain.prototype.searchOnly = function(ccl, filter)
{
  var self = this;
  return q.Promise(function(resolve, reject) {

    self.pz2.search(self.session, ccl, filter)
      .then(resolve, reject);

  });
}

/**
 * The search method guarantees that it will return a single
 * set of results in json format.
 *
 * Usage:
 *
 * ```javascript
 * curtain.search("ccl query").then(function(results, terms) {
 *   
 * }, function(err) { // error
 *   
 * }, function(stat) { // progress
 *   
 * });
 * ```
 *
 * @return {Promise} [description]
 */
Curtain.prototype.search = function(ccl, filter, terms) 
{
  var self = this;
  return q.Promise(function(resolve, reject, progress) {

    if (self.searching) {
      reject(new Error('Search already in progress.'));
    }
    
    self.searchOnly(ccl, filter)
      .then(function() {

        return q.all([
            promiseStat.call(self, progress)
          , promiseShow.call(self)
          , promiseTermlist.call(self, terms)
        ]).then(function(results) {

          self.searching = false;

          resolve({
            show: results[1],
            termlist: results[2]
          });

        }, reject);

      }, reject);
  });
};

/**
 * [record description]
 * @param  {[type]} id     [description]
 * @param  {[type]} offset [description]
 * @return {[type]}        [description]
 */
Curtain.prototype.record = function(id, offset) 
{
  var self = this;

  return q.Promise(function(resolve, reject) {
    return self.pz2.record(self.session, id, offset)
      .then(function(result) {

        if (offset === undefined) {
          parseXmlResponse(result, function(data) {
            // console.log(data);
            resolve(data);
          }, function(code, msg) {
            reject({code: code, msg: msg, session: self.session});
          });
        } else {
          // console.log(result.toString());
          resolve(result);
        }

      }, reject);
  });
};

/**
 * [stop description]
 * @return {[type]} [description]
 */
Curtain.prototype.stop = function() 
{
  clearIntervals.call(this);
};

/**
 * [clearIntervals description]
 * @return {[type]} [description]
 */
var clearIntervals = function() 
{
  this.statInterval.end();
  this.showInterval.end();
  this.termlistInterval.end();
};

module.exports = Curtain;