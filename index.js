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
  // this.activeclients = parseInt(result.activeclients[0]);
  // this.merged = parseInt(result.merged[0]);
  var start = parseInt(result.start[0]);
  
  this.total = parseInt(result.total[0]);
  this.pageSize = parseInt(result.num[0]);
  this.pageCount = this.total === 0 ? 0 : Math.ceil(this.total / this.pageSize);
  this.page = this.total <= this.pageSize ? 1 : (start < this.pageSize ? 1 : Math.floor(this.pageSize / start));
  this.records = [];

  for(var idxHit in result.hit) {
    var newHit = {}
      , oldHit = result.hit[idxHit]
      , loc    = oldHit.location[0]
      ;

    newHit.title = loc['md-title'][0];
    newHit.authors = loc['md-author_070'];
    newHit.publishers = loc['md-author_650'];
    newHit.subjects = loc['md-subject'];
    newHit.year = loc['md-year'][0];
    newHit.recno = parseInt(loc['md-recno'][0]);
    newHit.urls = loc['md-url'];

    newHit.count = parseInt(oldHit.count[0]);
    newHit.relevance = oldHit.relevance ? parseInt(oldHit.relevance[0]) : 0;
    newHit.recid = oldHit.recid[0];

    newHit.source = loc.$;

    // newHit.holdings = [];

    // for(var idxLoc in oldHit.location) {
    //   var holding = {}
    //     , location = oldHit.location[idxLoc];

    //   holding.source = location.$.id;
    //   holding.checksum = location.$.checksum;
    //   holding.digital = location['md-digital'];

    //   newHit.holdings.push(holding);
    // }

    // console.log(util.inspect(newHit, {showHidden: false, depth: null}));
    this.records.push(newHit);
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
 * [RecordObject description]
 * @param {[type]} result [description]
 */
var RecordObject = function(result)
{
  var rec = result.record;

  this.recid = parseInt(rec.recid[0].split(' ')[1]);
  this.authors = rec['md-author_070'];
  this.publishers = rec['md-author_650'];
  this.title = rec['md-title'][0];
  this.year = rec['md-year'][0];
  this.holdings = [];

  for (var i in rec.location) {
    var loc = rec.location[i];

    this.holdings.push({
      meta: {
        id: loc.$.id,
        name: loc.$.name,
        checksum: loc.$.checksum
      },
      digital: loc['md-digital'],
      rectype: loc['md-rectype'][0],
      biblevel: loc['md-biblevel'][0],
      subjects: loc['md-subject']
    });
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
var parseXmlResponse = function(result, callback, reject) 
{
  xml.parseString(result, function(err, data) 
  {
    if (err) { // XML parsing error
      reject(new Error(err));
    } else if(data.error) { // Pazpar2 error
      reject({code: parseInt(data.error.$.code), msg: data.error.$.msg});
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
      }, reject);

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
        resolve(self.session);
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
        }, reject);

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

          if (progress)
            progress(stat);

          if (stat.working == 0) {
            self.statInterval.end();          
            resolve(stat);
          }
            
        }, reject);
        
      }, reject).fail(reject);

    });

  });
};

/**
 * [promiseShow description]
 * @return {[type]} [description]
 */
var promiseShow = function(page, pageSize, sort, sortDir) 
{
  var self = this
    , options = {
        start: page <= 1 ? 0 : (page - 1) * pageSize
      , num: pageSize
      , sort: sort + ':' + (sortDir.toLowerCase() === 'asc' ? '1' : '0')
    }
    ;

  return q.Promise(function(resolve, reject) {

    self.showInterval.begin(function() {
      
      self.pz2.show(self.session, options)
        .then(function(result) {
          // console.log(result.toString());
          parseXmlResponse(result, function(data) {
            if (data.show.activeclients == 0) {
              self.showInterval.end();
              // console.log(util.inspect(data.show, {showHidden: false, depth: null}));
              resolve(new ShowObject(data.show));
            }
          }, reject);

        }, reject).fail(reject);

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
      
      self.pz2.termlist(self.session, terms).then(function(result) {

        parseXmlResponse(result, function(data) {
          if (data.termlist.activeclients == 0) {
            self.termlistInterval.end();
            resolve(new TermListObject(data));
          }
        }, reject);
        
      }, reject).fail(reject);

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
Curtain.prototype.startSearch = function(ccl, filter)
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
Curtain.prototype.search = function(options, terms, filter) 
{
  var self = this
    , ccl = typeof options === 'object' ? options.ccl : options
    , page = typeof options === 'object' ? parseInt(options.page) : 1
    , pageSize = typeof options === 'object' ? parseInt(options.pageSize) : 10
    , sort = typeof options === 'object' ? options.sort : 'relevance'
    , sortDir = typeof options === 'object' ? options.sortDir : 'asc'
    , timeStarted = Date.now()
    ;

  return q.Promise(function(resolve, reject, progress) {

    if (self.searching) {
      reject(new Error('Search already in progress.'));
    }

    self.startSearch(ccl, filter)
      .then(function() {

        return q.all([
            promiseStat.call(self, progress)
          , promiseShow.call(self, page, pageSize, sort, sortDir)
          , promiseTermlist.call(self, terms)
        ]).then(function(results) {

          self.searching = false;

          results[1].time = (Date.now() - timeStarted) * 0.001;

          // console.log('Curtain done searching.');

          resolve({
            show: results[1],
            termlist: results[2]
          });

        }, reject)
        .catch(reject)
        .done();

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
    return self.pz2.record(self.session, 'content: ' + id, offset)
      .then(function(result) {

        if (offset === undefined) {
          parseXmlResponse(result, function(data) {
            resolve(data);
          }, reject);
        } else {
          resolve(result);
        }

      }, reject);
  });
};

var Reject = function(reject, code, msg, session)
{
  var error = {
    code: code,
    msg: msg,
    session: session
  };

  reject(error);
};

var RejectCb = function(reject, self)
{
  return function(code, msg) {
    Reject(reject, code, msg, self.session);
  };
}


/**
 * [getRecord description]
 * @param  {[type]} id [description]
 * @return {[type]}    [description]
 */
Curtain.prototype.getRecord = function(id, filter)
{
  var self = this;

  return q.Promise(function(resolve, reject) {

    // Start the search
    self.startSearch('recid='+id, filter)
      .then(function() {

        // Stat for record existence
        promiseStat.call(self)
          .then(function(stat) {

            if (stat.hits === 0) { // 404 record not found
              Reject(reject, Curtain.ERR_MISSING_RECORD, 'Record not found', self.session);
            } else { // fetch record
              // Query for the plain record
              self.record(id).then(function(result) {

                // Create the record object
                var recordObject = new RecordObject(result);

                // Create an array of asyncronous calls to be made 
                // one for each location
                var promises = [];
                for (var i=0; i<recordObject.holdings.length; i++) {
                  promises.push(self.record(id, i));
                }

                // Fetch marcxml from all the different locations
                q.all(promises).then(function(marcxml) {
                  for (var i in marcxml) {
                    recordObject.holdings[i].marcxml = marcxml[i].toString();
                  }
                  resolve(recordObject);
                });

              }, reject);
            }

          }, reject);

      }, reject)
      .fail(reject);

  });
}

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