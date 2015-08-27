module.exports = function(sequelize, DataTypes) {
    var SipPresence = sequelize.define('CSDB_SipPresence', {
            SipUsername: {type:DataTypes.STRING, primaryKey:true},
            Domain: DataTypes.STRING,
            Status: DataTypes.STRING
        }
    );


    return SipPresence;
};