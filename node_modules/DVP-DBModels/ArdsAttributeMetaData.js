/**
 * Created by Heshan.i on 8/10/2015.
 */
module.exports = function(sequelize, DataTypes) {
    var ArdsAttributeMetadata = sequelize.define('ARDS_AttributeMetaData', {

            Tenant: DataTypes.INTEGER,
            Company: DataTypes.INTEGER,
            AttributeClass: DataTypes.STRING,
            AttributeType: DataTypes.STRING,
            AttributeCategory:DataTypes.STRING,
            WeightPrecentage: DataTypes.FLOAT,
            AttributeMetaDataId:{type:DataTypes.INTEGER, primaryKey:true,autoIncrement: true}

        }
    );
    return ArdsAttributeMetadata;
};