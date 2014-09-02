var Curtain = require('../index');
var assert = require('assert');

describe('Curtain', function() {

  var curtain;

  it('initializes the connection', function(done) {
    curtain = new Curtain({
      session: '90668034',
      terms: ['subject', 'author_070'],
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
