"use strict";

var
    uuid      = require('node-uuid');

module.exports = function(sequelize, DataTypes) {
  var UserFeed = sequelize.define("UserFeed", {
    name : {
      type : DataTypes.STRING,
      allowNull : false,
    },
    feed_token : {
      type      : DataTypes.STRING,
      allowNull : false,
    },
    type : {
      type      : DataTypes.ENUM('calendar', 'wallchart', 'company'),
      allowNull : false,
    },
  }, {

    classMethods: {
      associate : function( models ) {
        UserFeed.belongsTo(models.User, {as : 'user'});
      },

      promise_new_feed : function(args){
        var self = this,
            user = args.user,
            type = args.type;

        return self
          .find({ where : {userId : user.id, type : type} })
          .then(function(feed){
            if ( feed ) {
              feed.feed_token = uuid.v4();
              return feed.save();
            } else {
              return self.create({
                name       : "Calendar Feed",
                feed_token : uuid.v4(),
                type       : type,
                userId     : user.id,
              });
            }
          })
      },

    },

    instanceMethods : {
      is_calendar : function() {
        return this.type === 'calendar';
      },

      is_wallchart : function(){
        return this.type === 'wallchart';
      },
    },
  });

  return UserFeed;
};
