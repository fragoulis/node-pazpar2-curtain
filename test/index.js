var Curtain = require('../index')
  , assert = require('assert')
  , util = require('util')
  ;



var errorHandler = function(done) {
  return function(error) {
    done(new Error(util.format('[%s] %s (%s)', error.code, error.msg, error.session)));
  }
}

describe('Curtain', function() {

  var curtain = new Curtain();

  it('initializes the session', function(done) {
    curtain.init().then(function(session) {
      done();
    }, errorHandler(done));
  });
  
  // it('guarantees a valid session', function(done) {
  //   curtain.init({
  //     session: '296887961',
  //     safe: true
  //   }).then(function() {
  //     console.log(curtain.session);
  //     done();
  //   }, errorHandler(done));
  // });
  
  // it('pings the server', function(done) {
  //   curtain.ping().then(function(data) {
  //     console.log(data);
  //     done();
  //   }, function(err) {
  //     if (typeof err === 'string')
  //       done(new Error(err));
  //     else
  //       done(err);
  //   })
  // });
  
  // it('validates a session', function(done) {
  //   curtain.isSessionValid().then(function(isValid) {
  //     console.log(isValid);
  //   });
  //   done();
  // });

  // it('searches for "ti=saint"', function(done) {
  //   curtain.search('ti=saint')
  //     .then(function(results) {
  //       console.log(results.show.hit);
  //       done();
  //     }, function(err) {
  //       done(err);
  //     }, function(stat) {
  //       console.log('Progress %s%', stat.progress * 100);
  //     });
  // });
  
  it('loads a record', function(done) {

    curtain.getRecord(35131)
      .then(function(record) {
        console.log(record);
        done();
      }, errorHandler(done));
    
  });
});
