"use strict";

module.exports = function(sequelize, DataTypes) {
    var LeaveType = sequelize.define("LeaveType", {
        // TODO add validators!
        name : {
            type      : DataTypes.STRING,
            allowNull : false
        },
        color : {
            type         : DataTypes.string,
            allowNull    : false,
            defaultValue : '#ffffff',
        },
        use_allowance : {
            type         : DataTypes.BOOLEAN,
            allowNull    : false,
            defaultValue : true,
        }
    }, {
        classMethods: {
            associate : function( models ) {
                BankHoliday.belongsTo(models.Company, {as : 'company'});
            },

            generate_leave_types : function(args){
                var company = args.company;

                return BankHoliday.bulkCreate([
                    {
                        name : 'Holiday',
                        color : '#22AA66',
                        companyId : company.id,
                    },
                    {
                        name : 'Sick Leave',
                        color : '#459FF3',
                        companyId : company.id,
                    },
                ])
            },
        },

        instanceMethods : {

        }
    });

    return BankHoliday;
};
