
/*
 * Mixin that inject to user model object consumer set of methods necessary for
 * dealing with abcenses.
 *
 * */

'use strict';

var
    _             = require('underscore'),
    Promise       = require("bluebird"),
    CalendarMonth = require('../../calendar_month'),
    moment        = require('moment');

module.exports = function(sequelize){

  this._get_calendar_months_to_show = function(args){
    var year       = args.year,
    show_full_year = args.show_full_year;

    if (show_full_year) {
      return _.map([1,2,3,4,5,6,7,8,9,10,11,12], function(i){
        return moment(year.format('YYYY')+'-'+i+'-01');
      });
    }

    return _.map([0,1,2,3], function(delta){
      return moment().add(delta, 'months').startOf('month');
    })
  };


  this.promise_calendar = function(args) {
    var year       = args.year || moment(),
    show_full_year = args.show_full_year || false,
    model          = sequelize.models,
    this_user      = this,
    // Find or if we need to show multi year calendar
    is_multi_year = moment().month() > 8;

    var months_to_show = this_user._get_calendar_months_to_show({
      year           : year.clone(),
      show_full_year : show_full_year
    });

    return Promise.join(

      Promise.try(function(){
        return this_user.getDepartment();
      }),

      Promise.try(function(){
        return this_user.getCompany({
          include:[
            { model : model.BankHoliday, as : 'bank_holidays' },
            { model : model.LeaveType, as : 'leave_types' },
          ]
        });
      }),

      Promise.try(function(){
        return this_user.getMy_leaves({
          where : {
            status : { $ne : sequelize.models.Leave.status_rejected()},
            $or : {
              date_start : {
                $between : [
                  moment(year).startOf('year').format('YYYY-MM-DD'),
                  moment(
                    year.clone().add((is_multi_year ? 1 : 0), 'years')
                  ).endOf('year').format('YYYY-MM-DD'),
                ]
              },
              date_end : {
                $between : [
                  moment( year ).startOf('year').format('YYYY-MM-DD'),
                  moment(
                    year.clone().add((is_multi_year ? 1 : 0), 'years')
                  ).endOf('year').format('YYYY-MM-DD'),
                ]
              }
            }
          },
        });
      }),

      function(department, company, leaves){
        var leave_days = _.flatten( _.map(leaves, function(leave){
          return _.map( leave.get_days(), function(leave_day){
            leave_day.leave = leave;
            return leave_day;
          });
        }));

        return Promise.resolve(
          _.map(months_to_show, function(month){
            return new CalendarMonth(
              month,
              {
                bank_holidays :
                  department.include_public_holidays
                  ?  _.map(
                    company.bank_holidays,
                    function(day){return day.date}
                  )
                  : [],
                leave_days : leave_days,
              }
            );
          })
        );
      }

    ); // End of join
  };


  this.validate_overlapping = function(new_leave_attributes) {
    var this_user = this;

    var days_filter = {
      $between : [
        new_leave_attributes.from_date,
        moment(new_leave_attributes.to_date)
          .add(1,'days').format('YYYY-MM-DD'),
      ],
    };

    return this_user.getMy_leaves({
      where : {
        status : { $ne : sequelize.models.Leave.status_rejected()},

        $or : {
          date_start : days_filter,
          date_end : days_filter,
        },
      },
    })

    .then(function(overlapping_leaves){

      // Check there are overlapping leaves
      if (overlapping_leaves.length === 0){
          return Promise.resolve(1);
      }

      var overlapping_leave = overlapping_leaves[0];

      if (overlapping_leave.fit_with_leave_request(
            new_leave_attributes
      )){
          return Promise.resolve(1);
      }

      // Otherwise it is overlapping!
      var error = new Error('Overlapping booking!');
      error.user_message = 'Overlapping booking!';
      throw error;

    });
  }; // end of validate_overlapping


  // Promise all leaves requested by current user, regardless
  // their statuses
  //
  this.promise_my_leaves = function(args){

    var where_clause = {},
        year         = args.year || moment();

    if (args && args.filter_status) {
      where_clause = { status : args.filter_status };
    }


    where_clause['$or'] = {
      date_start : {
        $between : [
          moment().startOf('year').format('YYYY-MM-DD'),
          moment().endOf('year').format('YYYY-MM-DD'),
        ]
      },
      date_end : {
        $between : [
          moment().startOf('year').format('YYYY-MM-DD'),
          moment().endOf('year').format('YYYY-MM-DD'),
        ]
      }
    };

    return this.getMy_leaves({
      include : [{
        model : sequelize.models.LeaveType,
        as    : 'leave_type',
      },{
        model : sequelize.models.User,
        as    : 'approver',
        include : [{
          model : sequelize.models.Company,
          as : 'company',
          include : [{
            model : sequelize.models.BankHoliday,
            as : 'bank_holidays',
          }],
        }],
      }],
      where : where_clause,
    });
  };


  this.promise_my_active_leaves = function(args) {
    var year = args.year || moment();

    return this.promise_my_leaves({
      year          : year,
      filter_status : [
        sequelize.models.Leave.status_approved(),
        sequelize.models.Leave.status_new(),
        sequelize.models.Leave.status_pended_revoke(),
      ],
    });
  };


  // Promise leaves that are needed to be Approved/Rejected
  //
  this.promise_leaves_to_be_processed = function(){
    return this.getSupervised_leaves({
      include : [{
        model : sequelize.models.LeaveType,
        as    : 'leave_type',
      },{
        model : sequelize.models.User,
        as    : 'user',
        include : [{
          model : sequelize.models.Company,
          as : 'company',
          include : [{
            model : sequelize.models.BankHoliday,
            as    : 'bank_holidays',
          }],
        },{
          model : sequelize.models.Department,
          as    : 'department',
        }],
      }],
      where : {
        status : [
          sequelize.models.Leave.status_new(),
          sequelize.models.Leave.status_pended_revoke()
        ]
      },
    });
  }; // END of promise_leaves_to_be_processed


  this.calculate_number_of_days_taken_from_allowence = function(args){
    var year = moment();

    return _.reduce(
      _.map(
        _.filter(
          this.my_leaves,
          function (leave){ return leave.is_approved_leave(); }
        ),
        function(leave){ return leave.get_deducted_days_number(args); }
      ),
      function(memo, num){ return memo + num },
      0
    ) || 0;
  };


  // Based on leaves attached to the current user object,
  // the method does not perform any additional queries
  //
  this.get_leave_statistics_by_types = function(args){

    var statistics = {},
      limit_by_top = args.limit_by_top || false;

    // Calculate statistics as an object
    _.filter(
      this.my_leaves,
      function (leave){ return leave.is_approved_leave() }
    )
    .forEach(
      function(leave){

        if (! statistics.hasOwnProperty(leave.leave_type.id)) {
          statistics[leave.leave_type.id] = {
            leave_type : leave.leave_type,
            days_taken : 0,
          };
        }

        var stat_obj = statistics[leave.leave_type.id];

        stat_obj.days_taken = stat_obj.days_taken + leave.get_deducted_days_number({
          ignore_allowance : true,
        });
      }
    );

    var statistic_arr = _.map(
      _.pairs(statistics),
      function(pair){
        return pair[1];
      }
    );

    statistic_arr = _.sortBy(
        statistic_arr,
        'days_taken'
      )
      .reverse();


    if (limit_by_top) {
      statistic_arr = _.first(statistic_arr, 4);
    }

    return statistic_arr;
  },


  this.get_automatic_adjustment = function(args) {

    var now = (args && args.now) ? moment(args.now) : moment();

    if (
      now.year() !== moment(this.start_date).year()
      && ( ! this.end_date || moment(this.end_date).year() > now.year() )
    ){
        return 0;
    }

    var start_date = moment(this.start_date).year() === now.year()
      ? moment(this.start_date)
      : now.startOf('year'),
    end_date = this.end_date && moment(this.end_date).year() <= now.year()
      ? moment(this.end_date)
      : moment().endOf('year');

    return -1*(this.department.allowence - Math.round(
      this.department.allowence * end_date.diff(start_date, 'days') / 365
    ));
  };


  this.calculate_total_number_of_days_n_allowence = function(year) {

    // If optional paramater year was provided we need to calculate allowance
    // for that year, and if it is something other then current year,
    // adjustment should be made, return nominal setting from department
    if (year && year != moment().year()) {
      return this.department.allowence
    }

    // Get general allowence based on department
    return this.department.allowence
      + this.get_automatic_adjustment()
      // Adjust it based on current user
      + this.adjustment;
  };


  this.promise_my_leaves_for_calendar = function(args){
    var year = args.year || moment();

    return this.getMy_leaves({
      where : {
        status : { $ne : sequelize.models.Leave.status_rejected()},

        $or : {
          date_start : {
            $between : [
              moment(year).startOf('year').format('YYYY-MM-DD'),
              moment(year).endOf('year').format('YYYY-MM-DD'),
            ]
          },
          date_end : {
            $between : [
              moment(year).startOf('year').format('YYYY-MM-DD'),
              moment(year).endOf('year').format('YYYY-MM-DD'),
            ]
          }
        }
      },
    }); // End of MyLeaves
  };

};

