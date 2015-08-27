/**
 * Created by Heshan.i on 8/10/2015.
 */
module.exports = function(sequelize, DataTypes) {
    var ArdsAttributeinfo = sequelize.define('ARDS_AttributeInfo', {

            Tenant: {type:DataTypes.INTEGER,unique: 'AttributeInfoIndex'},
            Company: {type:DataTypes.INTEGER,unique: 'AttributeInfoIndex'},
            Attribute: {type:DataTypes.STRING,unique: 'AttributeInfoIndex'},
            Class: DataTypes.STRING,
            Type: DataTypes.STRING,
            Category:DataTypes.STRING,
            AttributeInfoId:{type:DataTypes.INTEGER, primaryKey:true,autoIncrement: true}

        }
    );
    return ArdsAttributeinfo;
};