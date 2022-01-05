import {
  RDSClient,
  DBInstance as SDKDBInstance,
  ReservedDBInstance as SDKReservedDBInstance,
  Tag,
  DescribeDBInstancesCommand,
  ListTagsForResourceCommand,
  DescribeReservedDBInstancesCommand,
} from '@aws-sdk/client-rds';
import { RDSPurchaseMethod } from '../purchaseMethod';

export type DBInstance = {
  instanceIdentifier: string;
  instanceClass: string;
  engine: string;
  multiAZ: boolean;
  purchaseMethod: RDSPurchaseMethod;
};

export type ReservedDBInstance = {
  leaseId: string;
  groupKey: string;
  instanceClass: string;
  instanceCount: number;
  multiAz: boolean;
};

interface DBInstancesByPurchaseMethod {
  ReservedInstance: DBInstance[];
  Needless: DBInstance[];
  Undefined: DBInstance[];
}

type CalculationUnit = {
  dbInstances: DBInstance[];
  reservedDBInstances: ReservedDBInstance[];
};

interface GroupedCalculationUnit {
  [groupKey: string]: CalculationUnit;
}

const client = new RDSClient({});

export const loadGroupedCalculationUnitsByDBInstances = async (
  dbInstances: DBInstance[],
): Promise<GroupedCalculationUnit> => {
  const initial: DBInstancesByPurchaseMethod = {
    ReservedInstance: [],
    Needless: [],
    Undefined: [],
  };
  const dbInstancesAndTagsPerReservationPurchaseMethod = dbInstances.reduce(
    (acc: DBInstancesByPurchaseMethod, dbInstance) => {
      const method = dbInstance.purchaseMethod;
      const result = {
        ...acc,
        [method]: [...acc[method], dbInstance],
      };
      return result;
    },
    initial,
  );
  const activeReservedDBInstances = await getActiveReservedDBInstances();
  return mergeAndGroupByReservedInstanceGroupKey(
    dbInstancesAndTagsPerReservationPurchaseMethod.ReservedInstance,
    activeReservedDBInstances,
  );
};

export const loadDBInstances = async (): Promise<DBInstance[]> => {
  const describeDBInstancesResult = await client.send(
    new DescribeDBInstancesCommand({}),
  );
  const sdkInstances = describeDBInstancesResult.DBInstances || [];
  return Promise.all(
    sdkInstances.map(async (instance): Promise<DBInstance> => {
      const listTagsResult = await client.send(
        new ListTagsForResourceCommand({
          ResourceName: instance.DBInstanceArn,
        }),
      );
      listTagsResult.TagList;
      return {
        instanceIdentifier: instance.DBInstanceIdentifier!,
        instanceClass: instance.DBInstanceClass!,
        engine: instance.Engine!,
        multiAZ: instance.MultiAZ!,
        purchaseMethod: getPurchaseMethod(listTagsResult.TagList!),
      };
    }),
  );
};

export const groupDBInstancesByPurchaseMethod = (
  instances: DBInstance[],
): DBInstancesByPurchaseMethod => {
  const result: DBInstancesByPurchaseMethod = {
    ReservedInstance: [],
    Needless: [],
    Undefined: [],
  };

  for (const instance of instances) {
    result[instance.purchaseMethod].push(instance);
  }

  return result;
};

const getPurchaseMethod = (tags: Tag[]): RDSPurchaseMethod => {
  for (const tag of tags) {
    if (tag.Key === 'ReservationPurchaseMethod') {
      if (tag.Value === 'ReservedInstance' || tag.Value === 'Needless') {
        return tag.Value;
      }
    }
  }

  return 'Undefined';
};

const getActiveReservedDBInstances = async (): Promise<
  ReservedDBInstance[]
> => {
  const result = await client.send(new DescribeReservedDBInstancesCommand({}));
  return (result.ReservedDBInstances || [])
    .filter((reserved) => reserved.State === 'active')
    .map((reserved) => {
      return {
        leaseId: reserved.LeaseId!,
        groupKey: getReservedInstanceGroupKeyFromReservedDBInstance(reserved),
        instanceClass: reserved.DBInstanceClass!,
        instanceCount: reserved.DBInstanceCount!,
        multiAz: reserved.MultiAZ!,
      };
    });
};

const getReservedInstanceGroupKeyFromReservedDBInstance = (
  reserved: SDKReservedDBInstance,
): string => {
  return [
    dbInstanceClassToDbInstanceClassType(reserved.DBInstanceClass!),
    reserved.ProductDescription!,
    reserved.MultiAZ ? 'MultiAZ' : 'SingleAZ',
  ].join('/');
};

const dbInstanceClassToDbInstanceClassType = (
  dbInstanceClass: string,
): string => {
  return dbInstanceClass.replace(/^(db\.[a-z0-9]{2,10})\..*/, '$1');
};

const mergeAndGroupByReservedInstanceGroupKey = (
  dbInstances: DBInstance[],
  activeReservedDBInstances: ReservedDBInstance[],
): GroupedCalculationUnit => {
  const initial: GroupedCalculationUnit = {};
  const intermediate = dbInstances.reduce((acc, instance) => {
    const key = getReservedInstanceGroupKeyFromDBInstance(instance);
    const instancesInTheKey = acc[key]?.dbInstances || [];
    return {
      ...acc,
      [key]: {
        dbInstances: [...instancesInTheKey, instance],
        reservedDBInstances: [],
      },
    };
  }, initial);
  return activeReservedDBInstances.reduce((acc, reserved) => {
    const instancesInTheKey = acc[reserved.groupKey].dbInstances || [];
    const reservedInstancesInTheKey =
      acc[reserved.groupKey].reservedDBInstances || [];
    return {
      ...acc,
      [reserved.groupKey]: {
        dbInstances: instancesInTheKey,
        reservedDBInstances: [...reservedInstancesInTheKey, reserved],
      },
    };
  }, intermediate);
};

const getReservedInstanceGroupKeyFromDBInstance = (
  instance: DBInstance,
): string => {
  return [
    dbInstanceClassToDbInstanceClassType(instance.instanceClass),
    instance.engine,
    instance.multiAZ ? 'MultiAZ' : 'SingleAZ',
  ].join('/');
};
