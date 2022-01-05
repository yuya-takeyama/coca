import {
  DescribeInstancesCommand,
  EC2Client,
  Instance as SDKEC2Instance,
} from '@aws-sdk/client-ec2';

import { EC2PurchaseMethod } from '../../purchaseMethod';

export interface EC2Instance {
  id: string;
  name: string;
  instanceType: string;
  isRunning: boolean;
  purchaseMethod: EC2PurchaseMethod;
  autoScalingGroupName: string | undefined;
}

const client = new EC2Client({});

const isRunning = (instance: SDKEC2Instance): boolean =>
  !!(instance.State && instance.State.Name === 'running');

const fromAWSSDKEC2Instance = (input: SDKEC2Instance): EC2Instance => {
  if (!input.InstanceType) {
    throw new Error(`InstanceType is not set: ${input.InstanceId}`);
  }
  if (!input.InstanceId) {
    throw new Error(`InstanceID is not set: ${JSON.stringify(input)}`);
  }

  return {
    id: input.InstanceId,
    name: getTagValue(input, 'Name') || '',
    instanceType: input.InstanceType,
    isRunning: isRunning(input),
    purchaseMethod: getReservationPurchaseMethod(input),
    autoScalingGroupName: getTagValue(input, 'aws:autoscaling:groupName'),
  };
};

export const loadEC2Instances = async (): Promise<EC2Instance[]> => {
  const instances: EC2Instance[] = [];
  const data = await client.send(new DescribeInstancesCommand({}));
  if (!data.Reservations) {
    throw new Error(
      `Invalid response from DescribeInstancesCommand: '$.Reservations' is not set`,
    );
  }

  for (const reservation of data.Reservations) {
    if (!reservation.Instances) {
      throw new Error(
        `Invalid response from DescribeInstancesCommand: '$.Reservations[].Instances' is not set`,
      );
    }

    for (const awsSdkInstance of reservation.Instances) {
      const instance = fromAWSSDKEC2Instance(awsSdkInstance);

      if (instance.isRunning && !instance.autoScalingGroupName) {
        instances.push(fromAWSSDKEC2Instance(awsSdkInstance));
      }
    }
  }

  return instances.sort((a, b) => a.name.localeCompare(b.name));
};

const getTagValue = (
  instance: SDKEC2Instance,
  tagKey: string,
): string | undefined => {
  if ('Tags' in instance) {
    for (const tag of instance.Tags!) {
      if (tag.Key === tagKey) {
        return tag.Value;
      }
    }

    return undefined;
  }

  throw new Error(
    `getTagValue: Invalid resource detected: ${JSON.stringify(instance)}`,
  );
};

const getReservationPurchaseMethod = (
  resource: SDKEC2Instance,
): EC2PurchaseMethod => {
  const method = getTagValue(resource, 'ReservationPurchaseMethod');

  switch (method) {
    case 'ComputeSavingsPlans':
    case 'EC2InstanceSavingsPlans':
    case 'SpotInstances':
    case 'Needless':
      return method;

    case undefined:
      return 'Undefined';

    default:
      throw new Error(`Unknown ReservationPurchaseMethod detected: ${method}`);
  }
};
