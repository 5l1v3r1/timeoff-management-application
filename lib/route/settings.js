/*
 *
 * */

"use strict";

var express   = require('express'),
    router    = express.Router(),
    validator = require('validator'),
    model     = require('../model/db'),
    Promise   = require('bluebird'),
    _         = require('underscore');

// Make sure that current user is authorized to deal with settings
router.all(/.*/, require('../middleware/ensure_user_is_admin'));

router.get('/company/', function(req, res) {

    req.user.getCompany().then(function(company){
        res.render('company', {
            title   : 'Company settings',
            company : company,
        });
    });
});

router.post('/company/', function(req, res){

    var name              = validator.trim(req.param('name')),
        country_code      = validator.trim(req.param('country')),
        start_of_new_year = validator.trim(req.param('year_starts'));

    if (!validator.matches(name, /^[a-z0-9 \.\,]+$/i)){
        req.session.flash_error('Name should contain only letters and numbers');
    }
    if (!validator.isAlphanumeric(country_code)){
        req.session.flash_error('Country should contain only letters and numbers');
    }
    if (!validator.isInt(start_of_new_year)) {
        req.session.flash_error('Start of the year should be a month number');
    }

    // In case of validation error redirect back to edit form
    if ( req.session.flash_has_errors() ) {
        return res.redirect('/settings/company/');
    }

    req.user.getCompany()

    .then(function(company){
        company.name              = name;
        company.country           = country_code;
        company.start_of_new_year = start_of_new_year;

        return company.save();
    })
    .then(function(){
        req.session.flash_message('Company was successfully updated');
        return res.redirect('/settings/company/');
    })
    .catch(function(error){
        console.error(
            'An error occurred when trying to edit company for user ' + req.user.id
            + ' : ' + error
        );

        req.session.flash_error(
            'Failed to update company details, please contact customer service'   
        );

        return res.redirect('/settings/company/');
    });
});


router.get('/departments/', function(req, res) {

    // Add JS that is specific only to current page
    res.locals.custom_java_script.push('/js/departments.js');

    var company_for_template;

    req.user.getCompany({
            include : [{ model : model.User, as : 'users' }],
        })
        .then(function(company){
            company_for_template = company;
            return company.getDepartments({
                include : [
                    { model : model.User, as : 'users' },
                ],
                // Explicitly order departments as all actions with them rely on
                // their order within current company
                order : [
                    [ model.Department.default_order_field() ]
                ],
            });
        })
        .then(function(departments){

            var allowence_options = [],
                allowence = 0.5;
            while (allowence <= 50) {
                allowence_options.push( {value : allowence} ); 
                allowence = allowence + 0.5;
            }

            res.render('departments', {
                title             : 'Departments settings',
                departments       : departments,
                company           : company_for_template,
                allowence_options : allowence_options,
            });
        });
});

router.post('/departments/', function(req, res){

    var name              = validator.trim(req.param('name')),
        country_code      = validator.trim(req.param('country')),
        start_of_new_year = validator.trim(req.param('year_starts'));

    req.user.getCompany({
        include : [
            {model : model.Department, as : 'departments'},
            {model : model.User, as : 'users'}
        ],
        order : [
            [ {model : model.Department, as : 'departments'}, model.Department.default_order_field() ]
        ],
    })

    .then(function(company){

        var promise_new_department = Promise.resolve(1);

        if (validator.trim(req.param('name__new'))) {
            var attributes = get_and_validate_department({
                req             : req,
                suffix          : 'new',
                company         : company,
                department_name : 'New department'
            });
            if ( req.session.flash_has_errors() ) {
                return Promise.resolve(1);
            }
            attributes.companyId = company.id;
            promise_new_department = model.Department.create(attributes);
        }

        return Promise.all([
            promise_new_department,
            _.map(

            company.departments,
            function(department, index){

                var attributes = get_and_validate_department({
                    req             : req,
                    suffix          : index,
                    company         : company,
                    department_name : department.name,
                });

                // If there were any validation errors: do not update department
                // (it affects all departments, that is if one department failed
                // validation - all departments are not to be updated)
                if ( req.session.flash_has_errors() ) {
                    return Promise.resolve(1);
                }

                return department.updateAttributes(attributes);
            }

            ) // End of map that create department update promises
        ]);
    })
  
    .then(function(){
        if ( req.session.flash_has_errors() ) {
            return res.redirect('/settings/departments/');
        } else {
            req.session.flash_message('Changes to departments were saved');
            return res.redirect('/settings/departments/');
        }
    })

    .catch(function(error){
        console.error(
            'An error occurred when trying to edit departments by user '+req.user.id
            + ' : ' + error
        );

        req.session.flash_error(
            'Failed to update departments details, please contact customer service'
        );

        return res.redirect('/settings/departments/');
    });
});

router.post('/departments/delete/:department_number/', function(req, res){

    // department_number is a index number of department to be removed based
    // on the list of department on the page, this is not an ID
    var department_number = req.param('department_number');

    if (!validator.isInt(department_number)) {
        console.error(
            'User '+req.user.id+' submited non-int department number '
                +department_number
        );

        req.session.flash_error('Cannot remove department: wronge parameters');

        return res.redirect('/settings/departments/');
    }

    req.user.getCompany({
        include : [
            {
                model : model.Department,
                as : 'departments',
                include : {
                    model : model.User,
                    as : 'users',
                }
            },
        ],
        order : [
            [ {model : model.Department, as : 'departments'}, model.Department.default_order_field() ]
        ],
    })
    .then(function(company){
        var department_to_remove = company.departments[ department_number ];

        // Check if user specify valid department number
        if (! department_to_remove) {

            console.error(
                'User '+req.user.id+' tried to remove non-existing department number'
                +department_number+' out of '+company.departments.length
            );

            req.session.flash_error('Cannot remove department: wronge parameters');

            return res.redirect('/settings/departments/');
        }

        if (department_to_remove.users.length > 0){
            req.session.flash_error(
                'Cannot remove department '+department_to_remove.name
                    +' as it still has '
                    +department_to_remove.users.length+' users.'
            );
            return res.redirect('/settings/departments/');
        }

        return department_to_remove.destroy();
    })
    .then(function(){
        req.session.flash_message('Department was successfully removed');
        return res.redirect('/settings/departments/');
    });
});

router.get('/bankholidays/', function(req, res) {

    // Add JS that is specific only to current page
    res.locals.custom_java_script.push('/js/departments.js');

    req.user.getCompany({
            include : [{ model : model.BankHoliday, as : 'bank_holidays' }],
            order : [[{model: model.BankHoliday, as : 'bank_holidays'}, 'date' ]],
        })
        .then(function(company){

            res.render('bank_holidays', {
                title   : 'Bank Holidays settings',
                company : company,
            });
        });
});

router.post('/bankholidays/', function(req,res){
    var name = validator.trim(req.param('name')),
        date = validator.trim(req.param('date'));

    req.user.getCompany({
        include : [{ model : model.BankHoliday, as : 'bank_holidays' }],
        order : [[{model: model.BankHoliday, as : 'bank_holidays'}, 'date' ]],
    })
    .then(function(company){

        var promise_new_bank_holiday = Promise.resolve(1);

        if (validator.trim(req.param('name__new'))) {
            var attributes = get_and_validate_bank_holiday({
                req       : req,
                suffix    : 'new',
                item_name : 'New Bank Holiday'
            });
            if ( req.session.flash_has_errors() ) {
                return Promise.resolve(1);
            }
            attributes.companyId = company.id;
            promise_new_bank_holiday = model.BankHoliday.create(attributes);
        }

        return Promise.all([
            promise_new_bank_holiday,
            _.map(

            company.bank_holidays,
            function(bank_holiday, index){

                var attributes = get_and_validate_bank_holiday({
                    req       : req,
                    suffix    : index,
                    item_name : bank_holiday.name,
                });

                // If there were any validation errors: do not update bank holiday
                // (it affects all bank holidays, that is if one failed
                // validation - all bank holidays are not to be updated)
                if ( req.session.flash_has_errors() ) {
                    return Promise.resolve(1);
                }

                return bank_holiday.updateAttributes(attributes);
            }

            ) // End of map that create bank_holiday update promises
        ]);
    })
    .then(function(){
        if ( req.session.flash_has_errors() ) {
            return res.redirect('/settings/bankholidays/');
        } else {
            req.session.flash_message('Changes to bank holidays were saved');
            return res.redirect('/settings/bankholidays/');
        }
    })
    .catch(function(error){
        console.error(
            'An error occurred when trying to edit Bank holidays by user '+req.user.id
            + ' : ' + error
        );

        req.session.flash_error(
            'Failed to update bank holidayes details, please contact customer service'
        );

        return res.redirect('/settings/bankholidays/');
    });

});


router.post('/bankholidays/delete/:bank_holiday_number/', function(req, res){

    // bank_holiday_number is a index number of bank_holiday to be removed based
    // on the list of bank holidays on the page, this is not an ID
    var bank_holiday_number = req.param('bank_holiday_number');

    if (!validator.isInt(bank_holiday_number)) {
        console.error(
            'User '+req.user.id+' submited non-int bank holiday number '
                +bank_holiday_number
        );

        req.session.flash_error('Cannot remove bank holiday: wronge parameters');

        return res.redirect('/settings/bankholidays/');
    }

    req.user.getCompany({
        include : [{ model : model.BankHoliday, as : 'bank_holidays' }],
        order : [[{model: model.BankHoliday, as : 'bank_holidays'}, 'date' ]],
    })
    .then(function(company){
        var bank_holiday_to_remove = company.bank_holidays[ bank_holiday_number ];

        // Check if user specify valid department number
        if (! bank_holiday_to_remove) {

            console.error(
                'User '+req.user.id+' tried to remove non-existing bank holiday number'
                +bank_holiday_number+' out of '+company.bank_holidays.length
            );

            req.session.flash_error('Cannot remove bank holiday: wronge parameters');

            return res.redirect('/settings/bankholidays/');
        }

        return bank_holiday_to_remove.destroy();
    })
    .then(function(){
        req.session.flash_message('Bank holiday was successfully removed');
        return res.redirect('/settings/bankholidays/');
    });
});

router.get('/leavetypes/', function(req, res){

    // TODO rebane this to something more general and update all other usages
    // Add JS that is specific only to current page
    res.locals.custom_java_script.push('/js/departments.js');

    req.user.getCompany({
            include : [{ model : model.LeaveType, as : 'leave_types' }],
            order : [[{model: model.LeaveType, as : 'leave_types'}, 'name' ]],
        })
        .then(function(company){

            res.render('leave_types', {
                title   : 'Leave types settings',
                company : company,
            });
        });
});

router.post('/leavetypes', function(req, res){

    req.user.getCompany({
        include : [{ model : model.LeaveType, as : 'leave_types' }],
        order : [[{model: model.LeaveType, as : 'leave_types'}, 'name' ]],
    })
    .then(function(company){

        var promise_new_leave_type = Promise.resolve(1);

        if (validator.trim(req.param('name__new'))) {
            var attributes = get_and_validate_leave_type({
                req       : req,
                suffix    : 'new',
                item_name : 'New Leave Type'
            });
            if ( req.session.flash_has_errors() ) {
                return Promise.resolve(1);
            }
            attributes.companyId = company.id;
            promise_new_leave_type = model.LeaveType.create(attributes);
        }

        return Promise.all([
            promise_new_leave_type,
            _.map(

            company.leave_types,
            function(leave_type, index){

                var attributes = get_and_validate_leave_type({
                    req       : req,
                    suffix    : index,
                    item_name : leave_type.name,
                });

                // If there were any validation errors: do not update leave type
                // (it affects all leave types, that is if one failed
                // validation - all leave types are not to be updated)
                if ( req.session.flash_has_errors() ) {
                    return Promise.resolve(1);
                }

                return leave_type.updateAttributes(attributes);
            }

            ) // End of map that create leave type update promises
        ]);
    })
    .then(function(){
        if ( ! req.session.flash_has_errors() ) {
            req.session.flash_message('Changes to leave types were saved');
        }
        return res.redirect('/settings/leavetypes/');
    })
    .catch(function(error){
        console.error(
            'An error occurred when trying to edit Leave types by user '+req.user.id
            + ' : ' + error
        );

        req.session.flash_error(
            'Failed to update leave types details, please contact customer service'
        );

        return res.redirect('/settings/leavetypes/');
    });

});


router.post('/leavetypes/delete/:leave_type_number/', function(req, res){

    // leave_type_number is an index number of leave_type to be removed based
    // on the list of leave types on the page, this is not an ID
    var leave_type_number = req.param('leave_type_number');

    if (!validator.isInt(leave_type_number)) {
        console.error(
            'User '+req.user.id+' submited non-int leave_type number '
                +bank_holiday_number
        );

        req.session.flash_error('Cannot remove leave_type: wronge parameters');

        return res.redirect('/settings/leavetypes/');
    }

    req.user.getCompany({
        include : [{ model : model.LeaveType, as : 'leave_types' }],
        order : [[{model: model.LeaveType, as : 'leave_types'}, 'name' ]],
    })
    .then(function(company){
        var leave_type_to_remove = company.leave_types[ leave_type_number ];

        // Check if user specify valid department number
        if (! leave_type_to_remove) {

            console.error(
                'User '+req.user.id+' tried to remove non-existing leave type number'
                +leave_type_number+' out of '+company.leave_types.length
            );

            req.session.flash_error('Cannot remove leave type: wronge parameters');

            return res.redirect('/settings/leavetypes/');
        }

        return leave_type_to_remove.destroy();
    })
    .then(function(){
        req.session.flash_message('Leave type was successfully removed');
        return res.redirect('/settings/leavetypes/');
    });
});


function get_and_validate_department(args) {
    var req             = args.req,
        index           = args.suffix,
        company         = args.company,
        department_name = args.department_name;

    // Get user parameters
    var name = validator.trim(req.param('name__'+index)),
        allowence = validator.trim(req.param('allowence__'+index)),
        include_public_holidays = validator.toBoolean(
            req.param('include_public_holidays__'+index)
        ),
        boss_id = validator.trim(req.param('boss_id__'+index));

    // Validate provided parameters
    if (!validator.matches(name, /^[a-z0-9 \.\,]+$/i)){
        req.session.flash_error(
            'New name of '+department_name+' should contain only letters and numbers'
        );
    }
    // New allowance should be from range of (0;50]
    if (!validator.isFloat(allowence)) {
        req.session.flash_error(
            'New allowence for '+department_name+' should be numeric'
        );
    } else if (!((0 < allowence) && (allowence <= 50))) {
        req.session.flash_error(
            'New allowence for '+department_name+' should be between 0.5 and 50 days'
        );
    }
    // New manager ID should be numeric and from within
    // current company
    if (!validator.isNumeric( boss_id ) ) {
        req.session.flash_error(
            'New boss reference for '+department_name+' should be numeric'
        );
    } else if (_.contains(
        _.map(
            company.users, function(user){ return user.id; }),
            boss_id
    )) {
        req.session.flash_error(
            'New boss for '+department_name+' is unknown'
        );
    }

    return {
        name                    : name,
        allowence               : allowence,
        include_public_holidays : include_public_holidays,
        bossId                  : boss_id,
    };
}

function get_and_validate_bank_holiday(args) {
    var req       = args.req,
        index     = args.suffix,
        item_name = args.item_name;

    // Get user parameters
    var name = validator.trim(req.param('name__'+index)),
        date = validator.trim(req.param('date__'+index));

    // Validate provided parameters

    if (!validator.matches(name, /^[a-z0-9 \.\,]+$/i)){
        req.session.flash_error(
            'New name of '+item_name+' should contain only letters and numbers'
        );
    }
    // TODO uncomment and do proper validation
    // if (!validator.isDate(date)) {
    if (!validator.matches(date, /./)) {
        req.session.flash_error(
            'New day for '+item_name+' should be date'
        );
    }

    return {
        name : name,
        date : date,
    };
}

function get_and_validate_leave_type(args) {
    var req       = args.req,
        index     = args.suffix,
        item_name = args.item_name;

    // Get user parameters
    var name  = validator.trim(req.param('name__'+index)),
        color = validator.trim(req.param('color__'+index)),
        use_allowance = validator.toBoolean(
            req.param('use_allowance__'+index)
        );

    // Validate provided parameters

    if (!validator.matches(name, /^[a-z0-9 \.\,]+$/i)){
        req.session.flash_error(
            'New name of '+item_name+' should contain only letters and numbers'
        );
    }
    if (!validator.isHexColor(color)) {
        req.session.flash_error(
            'New color for '+item_name+' should be color code'
        );
    }

    return {
        name          : name,
        color         : color,
        use_allowance : use_allowance,
    };
}

module.exports = router;
