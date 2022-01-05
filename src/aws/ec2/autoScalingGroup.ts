import {
  AutoScalingClient,
  DescribeAutoScalingGroupsCommand,
  DescribeLaunchConfigurationsCommand,
  AutoScalingGroup as SDKAutoScalingGroup,
  LaunchTemplateSpecification as SDKLaunchTemplateSpecification,
} from '@aws-sdk/client-auto-scaling';

import {
  EC2Client,
  DescribeLaunchTemplateVersionsCommand,
} from '@aws-sdk/client-ec2';
import { EC2PurchaseMethod } from '../../purchaseMethod';

export interface AutoScalingGroup {
  name: string;
  minSize: number;
  instanceType: string;
  eksNodeGroupName: string | undefined;
  purchaseMethod: EC2PurchaseMethod;
}

const client = new AutoScalingClient({});
const ec2Client = new EC2Client({});

export const loadAutoScalingGroups = async (): Promise<AutoScalingGroup[]> => {
  const describeASGResult = await client.send(
    new DescribeAutoScalingGroupsCommand({}),
  );

  if (!describeASGResult.AutoScalingGroups) {
    throw new Error(
      `Invalid response: The result from DescribeAutoScalingGroupsCommand should have AutoScalingGroups`,
    );
  }

  const asgs = describeASGResult.AutoScalingGroups.filter(
    (asg) => !getEKSNodeGroupName(asg),
  );
  const asgsAndInstanceTypes: AutoScalingGroup[] = await Promise.all(
    asgs.map(async (asg): Promise<AutoScalingGroup> => {
      if (!asg.AutoScalingGroupName) {
        throw new Error(
          `AutoScalinGroup should have AutoScalinGroupName: ${asg.AutoScalingGroupARN}`,
        );
      }
      if (typeof asg.MinSize !== 'number') {
        throw new Error(
          `AutoScalinGroup should have MinSize as a number: ${asg.AutoScalingGroupARN}`,
        );
      }

      const instanceType = await getInstanceTypeByAsg(asg);
      return {
        name: asg.AutoScalingGroupName,
        minSize: asg.MinSize,
        instanceType: instanceType,
        eksNodeGroupName: undefined,
        purchaseMethod: getReservationPurchaseMethod(asg),
      };
    }),
  );

  return asgsAndInstanceTypes;
};

const getEKSNodeGroupName = (asg: SDKAutoScalingGroup): string | undefined => {
  return getTagValue(asg, 'eks:nodegroup-name');
};

const getInstanceTypeByAsg = async (
  asg: SDKAutoScalingGroup,
): Promise<string> => {
  if (asg.LaunchTemplate) {
    return await getInstanceTypeByASGAndLaunchTemplateSpecification(
      asg,
      asg.LaunchTemplate,
    );
  } else if (asg.LaunchConfigurationName) {
    const confName = asg.LaunchConfigurationName;
    return await getInstanceTypeByASGAndLaunchConfigurationName(
      asg,
      asg.LaunchConfigurationName,
    );
  }

  throw new Error(
    `Either LaunchTemplate or LaunchConfigurationName is required: ${asg.AutoScalingGroupName}`,
  );
};

const getInstanceTypeByASGAndLaunchTemplateSpecification = async (
  asg: SDKAutoScalingGroup,
  specification: SDKLaunchTemplateSpecification,
) => {
  if (!specification.LaunchTemplateId) {
    throw new Error(
      `Invalid launch template: LaunchTemplateId is missing: ${asg.AutoScalingGroupName}`,
    );
  }
  if (!specification.Version) {
    throw new Error(
      `Invalid launch template: Version is missing: ${asg.AutoScalingGroupName}`,
    );
  }
  const launchTemplateResult = await ec2Client.send(
    new DescribeLaunchTemplateVersionsCommand({
      LaunchTemplateId: specification.LaunchTemplateId,
      Versions: [specification.Version],
    }),
  );

  if (launchTemplateResult.LaunchTemplateVersions?.length !== 1) {
    throw new Error(
      `Number of Launch Template Versions should be 1: ${asg.AutoScalingGroupName}`,
    );
  }
  const launchTemplateVersion = launchTemplateResult.LaunchTemplateVersions[0];
  const instanceType = launchTemplateVersion.LaunchTemplateData?.InstanceType;

  if (!instanceType) {
    throw new Error(
      `InstanceType is missing in Launch Template: ${asg.AutoScalingGroupName}`,
    );
  }

  return instanceType;
};

const getInstanceTypeByASGAndLaunchConfigurationName = async (
  asg: SDKAutoScalingGroup,
  name: string,
): Promise<string> => {
  const launchConfigResult = await client.send(
    new DescribeLaunchConfigurationsCommand({
      LaunchConfigurationNames: [name],
    }),
  );

  if (launchConfigResult.LaunchConfigurations?.length !== 1) {
    throw new Error(
      `Number of Launch Configurations should be 1, but got ${launchConfigResult.LaunchConfigurations?.length}: ${asg.AutoScalingGroupName}`,
    );
  }

  if (!launchConfigResult.LaunchConfigurations[0].InstanceType) {
    throw new Error(`InstanceType is not set in LaunchConfiguration: ${name}`);
  }

  return launchConfigResult.LaunchConfigurations[0].InstanceType;
};

const getTagValue = (
  instance: SDKAutoScalingGroup,
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
  resource: SDKAutoScalingGroup,
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
