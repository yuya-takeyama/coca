import {
  EC2Resources,
  loadCalculatedResources,
} from '../../aws/ec2/aggregator';
import { EC2Instance } from '../../aws/ec2/instance';

type EC2InstanceSavingsPlansResourcesGroupedByInstanceFamily = {
  [key: string]: EC2Resources;
};

const groupByInstanceFamily = (
  resources: EC2Resources,
): EC2InstanceSavingsPlansResourcesGroupedByInstanceFamily => {
  const result: EC2InstanceSavingsPlansResourcesGroupedByInstanceFamily = {};

  for (const instance of resources.EC2) {
    const family = getInstanceFamily(instance);
    if (typeof result[family] === 'undefined') {
      result[family] = { EC2: [], ASG: [], EKS: [] };
    }

    result[family].EC2.push(instance);
  }

  for (const _ of resources.ASG) {
    throw new Error(
      'Calculation for Auto Scaling Group with EC2 Savings Plans is not implemented',
    );
  }

  for (const _ of resources.EKS) {
    throw new Error(
      'Calculation for EKS with EC2 Savings Plans is not implemented',
    );
  }

  return result;
};

const getInstanceFamily = (instance: EC2Instance): string => {
  const family = instance.instanceType?.split('.')[0];
  if (typeof family !== 'string') {
    throw new Error(
      `Invalid instance type: ${instance.instanceType}: ${instance.id}`,
    );
  }

  return family;
};

(async () => {
  const groupedResources = await loadCalculatedResources();
  const resourcesGroupedByInstanceFamily = groupByInstanceFamily(
    groupedResources.EC2InstanceSavingsPlans,
  );
  console.log('%j', resourcesGroupedByInstanceFamily);
})();
