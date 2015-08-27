/**
 * Created by Rajinda on 8/7/2015.
 */


module.exports = function(sequelize, DataTypes) {
    var CampCallBackReasons = sequelize.define('DB_CAMP_CallBackReasons', {
            Reason: {type:DataTypes.STRING,unique: 'CallBackReasonsCompositeIndex'},
            TenantId:{type:DataTypes.INTEGER,unique: 'CallBackReasonsCompositeIndex'},
            CompanyId:{type:DataTypes.INTEGER,unique: 'CallBackReasonsCompositeIndex'},
            Status:DataTypes.BOOLEAN,
            ReasonId:{type:DataTypes.INTEGER, primaryKey:true,autoIncrement: true}
        }
    );
    return CampCallBackReasons;
};

