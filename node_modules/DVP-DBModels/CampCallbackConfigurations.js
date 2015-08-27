/**
 * Created by Rajinda on 8/7/2015.
 */


module.exports = function(sequelize, DataTypes) {
    var CampCallbackConfigurations = sequelize.define('DB_CAMP_CallbackConfigurations', {
            ConfigureId: {type:DataTypes.INTEGER,unique: 'CallBackConfigCompositeIndex'},
            MaxCallBackCount:{type:DataTypes.INTEGER,unique: 'CallBackConfigCompositeIndex'},
            ReasonId:{type:DataTypes.INTEGER,unique: 'CallBackConfigCompositeIndex'},
            CallbackInterval:{type:DataTypes.INTEGER},
            CallBackConfId:{type:DataTypes.INTEGER, primaryKey:true,autoIncrement: true}
        }
    );
    return CampCallbackConfigurations;
};

