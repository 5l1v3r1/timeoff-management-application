'use strict';

var webdriver = require('selenium-webdriver'),
    By        = require('selenium-webdriver').By,
    expect    = require('chai').expect,
    Promise   = require("bluebird");


module.exports = Promise.promisify( function(args, callback){

  var application_host = args.application_host,
      driver           = args.driver,
      result_callback  = callback,
      logout_link_css_selector = 'a[href="/logout/"]';

  // Open front page
  driver
    .get( application_host )
    // Make sure that Logout link exists
    .then(function(){
      return driver.isElementPresent( By.css( logout_link_css_selector ) );
    })
    .then(function(is_present){
      expect(is_present).to.be.equal(true);
    });

  // Click logout link
  driver
    .findElement( By.css(logout_link_css_selector) )
    .then(function(el){
      return el.click();
    })
    .then(function(){

      return driver.isElementPresent( By.css( logout_link_css_selector ) );
    })
    // Check that there is no more Logout link
    .then(function(is_present){

      expect(is_present).to.be.equal(false);

      // "export" current driver
      result_callback(
        null,
        {
          driver : driver,
        }
      );
    });

});

