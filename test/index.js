var Curtain = require('../index');
var assert = require('assert');

describe('Curtain', function() {

  var curtain = new Curtain();

  it('initializes the connection', function(done) {
    curtain.init({
      session: '246404645',
      terms: ['subject', 'author_070'],
      safe: true
    });

    done();
  });

  it('searches for "ti=saint"', function(done) {
    curtain.search('ti=saint')
      .then(function(results) {
        console.log(results.show.hit[0].holdings);
        done();
      }, function(err) {
        done(err);
      }, function(stat) {
        console.log('Progress %s%', stat.progress * 100);
      });
  })

});
