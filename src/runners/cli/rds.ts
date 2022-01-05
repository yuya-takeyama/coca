import {
  DBInstance,
  groupDBInstancesByPurchaseMethod,
  loadDBInstances,
  loadGroupedCalculationUnitsByDBInstances,
  ReservedDBInstance,
} from '../../aws/rds';

const dbInstanceClassToDbInstanceSize = (dbInstanceClass: string): string => {
  return dbInstanceClass.replace(/.+\.([a-z0-9]{2,20}$)/, '$1');
};

const getNormalizedUnitFromDBInstance = (dbInstance: DBInstance): number => {
  const unit = getNormalizedUnitFromDBInstanceClass(dbInstance.instanceClass);
  return dbInstance.multiAZ ? unit * 2 : unit;
};

const getNormalizedUnitFromReservedDBInstance = (
  reserved: ReservedDBInstance,
): number => {
  const unit = getNormalizedUnitFromDBInstanceClass(reserved.instanceClass);
  return (reserved.multiAz ? unit * 2 : unit) * reserved.instanceCount;
};

const getNormalizedUnitFromDBInstanceClass = (
  dbInstanceClass: string,
): number => {
  switch (dbInstanceClassToDbInstanceSize(dbInstanceClass)) {
    case 'micro':
      return 0.5;

    case 'small':
      return 1;

    case 'medium':
      return 2;

    case 'large':
      return 4;

    case 'xlarge':
      return 8;

    case '2xlarge':
      return 16;

    case '4xlarge':
      return 32;

    case '8xlarge':
      return 64;

    case '10xlarge':
      return 80;

    case '16xlarge':
      return 128;

    default:
      throw new Error(`Not implemented: ${dbInstanceClass}`);
  }
};

(async () => {
  try {
    const instances = await loadDBInstances();
    const instancesByPurchaseMethod =
      groupDBInstancesByPurchaseMethod(instances);
    const groupedCalculationUnits =
      await loadGroupedCalculationUnitsByDBInstances(instances);

    console.log('# Instances to purchase Reserved Instances');
    console.log();
    console.log('These are instances require purchasing Reserved Instances');
    console.log();

    for (const key of Object.keys(groupedCalculationUnits)) {
      const data = groupedCalculationUnits[key];
      console.log(`## ${key}`);
      console.log();
      console.log('### Running DB Instances');
      console.log();
      let totalRunningUnit = 0;

      for (const instance of data.dbInstances) {
        const normalizedUnit = getNormalizedUnitFromDBInstance(instance);
        totalRunningUnit += normalizedUnit;
        console.log(
          `* ${instance.instanceIdentifier} (${instance.instanceClass}) => ${normalizedUnit}`,
        );
      }

      console.log();
      console.log(`Total running unit: ${totalRunningUnit}`);

      console.log();
      console.log('### Purcahsed Reserved DB Instances');
      console.log();
      let totalPurchasedUnit = 0;

      for (const reserved of data.reservedDBInstances) {
        const normalizedUnit =
          getNormalizedUnitFromReservedDBInstance(reserved);
        totalPurchasedUnit += normalizedUnit;
        console.log(
          `* ${reserved.leaseId}: (${reserved.instanceClass} * ${reserved.instanceCount}) => ${normalizedUnit}`,
        );
      }

      console.log();
      console.log(`Total purchased unit: ${totalPurchasedUnit}`);

      console.log();

      console.log('### Purchase required unit');
      console.log();

      const purchaseRequiredUnit = totalRunningUnit - totalPurchasedUnit;
      if (purchaseRequiredUnit === 0) {
        console.log('You have already purchased required unit');
      } else if (purchaseRequiredUnit > 0) {
        console.log(
          `You need to purchase ${purchaseRequiredUnit} unit of DB Reserved Instances for ${key}`,
        );
      } else {
        console.log(
          `Over purchased ${Math.abs(
            purchaseRequiredUnit,
          )} unit of DB Reserved Instances!`,
        );
      }

      console.log();
    }

    console.log(
      "# Instances which don't require purchasing Reserved Instances",
    );
    console.log();

    for (const instance of instancesByPurchaseMethod.Needless) {
      console.log(
        `* ${instance.instanceIdentifier}: (${instance.instanceClass})`,
      );
    }

    console.log();

    console.log("# Instances which aren't set ReservationPurchaseMethod tag");
    console.log();
    console.log('Please set `ReservationPurchaseMethod` to calcualte');
    console.log();

    for (const instance of instancesByPurchaseMethod.Undefined) {
      console.log(
        `* ${instance.instanceIdentifier}: (${instance.instanceClass})`,
      );
    }
  } catch (err) {
    console.error(err);
  }
})();
