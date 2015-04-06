
/*
 *  Contain handlers for dealing with user account:
 *      - login
 *      - logout
 *      TODO
 *      - register
 *      - forget password
 *
 *  Module exports FUNCTION that create a router object,
 *  not the router itself!
 *  Exported function gets passport object.
 * */
'use strict';

var model = require('../model/db');

module.exports = function(passport) {

    var express = require('express');
    var router  = express.Router();

    router.get('/login', function(req, res){
        res.render('login');
    });

    router.post('/login',

        function(req, res, next) {
            passport.authenticate('local', function(err, user, info) {
                if (err) { return next(err); }

                if (!user) {
                    req.session.flash_error('Incorrect credentials');
                    return res.redirect('/login');
                }

                req.logIn(user, function(err) {
                    if (err) { return next(err); }

                    req.session.flash_message('Welcome back '+user.name+'!');

                    return res.redirect('/dashboard/');
                });
            })(req, res, next);
        }
    );

    router.get('/logout', function(req, res){
        req.logout();
        res.redirect('/');
    });

    router.get('/register', function(req, res){

        res.render('register');
    });

    router.post('/register', function(req, res){

        // TODO at some point we need to unified form validation code
        // and make it reusable

        var email_validation_re = /^([\w-]+(?:\.[\w-]+)*)@((?:[\w-]+\.)*\w[\w-]{0,66})\.([a-z]{2,6}(?:\.[a-z]{2})?)$/i;

        var email = req.param('email');
        if (!email){
            req.session.flash_error('Email was not provided');
        } else if ( ! email_validation_re.test( email )) {
            req.session.flash_error('Email address is invalid');
        }

        var name = req.param('name');
        if (!name){
            req.session.flash_error('Name was not specified');
        }

        var lastname = req.param('lastname');
        if (!lastname) {
            req.session.flash_error('Last was not specified');
        }        

        var password = req.param('password');
        if (!password) {
            req.session.flash_error('Password could not be blank');
        } else if ( password !== req.param('password_confirmed') ) {
            req.session.flash_error('Confirmed password does not match initial one');
        }

        // In case of validation error redirect back to registration form
        if ( req.session.flash_has_errors() ) {
            return res.redirect('/register/');
        }

        // Try to create new record of user
        model.User.register_new_user({
            email    : email,
            password : password,
            name     : name,
            lastname : lastname
        })
        .then(function(user){

            req.session.flash_message(
                'Registration is complete. You can login to the system'
            );

            // NOTE maybe automatically login user and redirect to the dashboard?
            res.redirect('/login/');
        })
        .catch(function(error){
            console.error(
                'An error occurred when trying to register new user '
                    + email + ' : ' + error
            );

            req.session.flash_error(
                'Failed to register user please contact customer service'
            );

            res.redirect('/register/');
        });
    
    });

    return router;
};
