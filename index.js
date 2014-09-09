'use strict';

var Pazpar2 = require('pazpar2')
  , q = require('q')
  ;

/**
 * Helper class.
 * 
 * @param {[type]}   interval [description]
 * @param {Function} callback [description]
 */
var Interval = function(interval) {
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
}

/**
 * The show command's result object.
 */
var ShowObject = function(result) {

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
}

/**
 * The stat command's result object.
 */
var StatObject = function(result) {
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
}

/**
 * The termlist command's result object.
 */
var TermListObject = function(result) {
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
}

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
var Curtain = function(options) {
  options = options || {};

  this.pingInterval = 5000;
  this.statInterval = new Interval(options.statInterval || 1000);
  this.showInterval = new Interval(options.showInterval || 1000);
  this.termlistInterval = new Interval(options.termlistInterval || 1000);
  this.searching = false;
};

/**
 * [init description]
 * @param  {[type]} options [description]
 * @return {[type]}         [description]
 */
Curtain.prototype.init = function(options) {
  options = options || {};

  this.pz2 = new Pazpar2({
    session: options.session || null,
    terms: options.terms || null
  });

  if (options.safe)
    return this.pz2.safeInit();

  return this.pz2.init();
};

/**
 * Calls the stat command every X seconds until the server
 * is not working anymore.
 * 
 * @return {Promise}
 */
var promiseStat = function(progress) {
  var self = this;
  return q.Promise(function(resolve, reject) {

    self.statInterval.begin(function() {
      
      self.pz2.stat().then(function(result) {
        var stat = new StatObject(result.stat);
        progress(stat);
        if (stat.working == 0) {
          self.statInterval.end();          
          resolve(stat);
        }
      }, function(err) {
        console.log('promiseStat');
        reject(err);
      });

    });

  });
}

/**
 * [promiseShow description]
 * @return {[type]} [description]
 */
var promiseShow = function() {
  var self = this;
  return q.Promise(function(resolve, reject) {

    self.showInterval.begin(function() {
      
      self.pz2.show().then(function(result) {
        if (result.show.activeclients == 0) {
          self.showInterval.end();
          resolve(new ShowObject(result.show));
        }
      }, function(err) {
        console.log('promiseShow');
        reject(err);
      });

    });

  });
}

/**
 * [promiseTermlist description]
 * @return {[type]} [description]
 */
var promiseTermlist = function() {
  var self = this;
  return q.Promise(function(resolve, reject) {

    self.termlistInterval.begin(function() {
      
      self.pz2.termlist().then(function(result) {
        if (result.termlist.activeclients == 0) {
          self.termlistInterval.end();
          resolve(new TermListObject(result));
        }
      }, function(err) {
        console.log('promiseTermlist');
        reject(err);
      });

    });

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
Curtain.prototype.search = function(ccl, filter) {
  var self = this;
  return q.Promise(function(resolve, reject, progress) {

    if (self.searching) {
      reject(new Error('Search already in progress.'));
    }
    
    return self.pz2.search(ccl, filter)
      .then(function() {

        return q.all([
          promiseStat.call(self, progress)
          ,promiseShow.call(self)
          ,promiseTermlist.call(self)
        ]).then(function(results) {

          self.searching = false;

          resolve({
            show: results[1],
            termlist: results[2]
          });

        }, reject);

      }, reject);
  });
}

/**
 * [record description]
 * @param  {[type]} id     [description]
 * @param  {[type]} offset [description]
 * @return {[type]}        [description]
 */
Curtain.prototype.record = function(id, offset) {
  var self = this;

  return q.Promise(function(resolve, reject) {
    return self.pz2.record(id, offset)
      .then(resolve, reject);
  });
}

/**
 * [stop description]
 * @return {[type]} [description]
 */
Curtain.prototype.stop = function() {
  clearIntervals.call(this);
}

/**
 * [clearIntervals description]
 * @return {[type]} [description]
 */
var clearIntervals = function() {
  this.statInterval.end();
  this.showInterval.end();
  this.termlistInterval.end();
}

module.exports = Curtain;