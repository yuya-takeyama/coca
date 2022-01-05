import { AutoScalingGroup, loadAutoScalingGroups } from './autoScalingGroup';
import { EC2Instance, loadEC2Instances } from './instance';
import { EKSNodeGroup, loadEKSNodegroups } from './eks';
import {
  getInstanceTypeSavingsPlansOfferingMap,
  WithSavingsPlanOffering,
} from './savingsPlans';
import { EC2PurchaseMethod } from '../../purchaseMethod';

export interface EC2Resources {
  EC2: EC2Instance[];
  ASG: AutoScalingGroup[];
  EKS: EKSNodeGroup[];
}

export interface EC2ResourcesWithSavingsPlansOffering {
  EC2: (EC2Instance & WithSavingsPlanOffering)[];
  ASG: (AutoScalingGroup & WithSavingsPlanOffering)[];
  EKS: (EKSNodeGroup & WithSavingsPlanOffering)[];
}

export type GroupedEC2Resources = {
  [K in EC2PurchaseMethod]: EC2Resources;
};

export const loadCalculatedResources = async () => {
  const promises: [
    Promise<EC2Instance[]>,
    Promise<AutoScalingGroup[]>,
    Promise<EKSNodeGroup[]>,
  ] = [loadEC2Instances(), loadAutoScalingGroups(), loadEKSNodegroups()];
  const [ec2Resources, asgResources, eksResources] = await Promise.all(
    promises,
  );

  const groupedResources = initialGroupedCalculatedResources();
  const groupedResources2 = groupEC2(groupedResources, ec2Resources);
  const groupedResources3 = groupASG(groupedResources2, asgResources);
  const groupedResources4 = groupEKS(groupedResources3, eksResources);

  return groupedResources4;
};

const initialGroupedCalculatedResources = (): GroupedEC2Resources => ({
  ComputeSavingsPlans: {
    EC2: [],
    ASG: [],
    EKS: [],
  },
  EC2InstanceSavingsPlans: {
    EC2: [],
    ASG: [],
    EKS: [],
  },
  SpotInstances: {
    EC2: [],
    ASG: [],
    EKS: [],
  },
  Needless: {
    EC2: [],
    ASG: [],
    EKS: [],
  },
  Undefined: {
    EC2: [],
    ASG: [],
    EKS: [],
  },
});

const groupEC2 = (
  groupedResources: GroupedEC2Resources,
  resources: EC2Instance[],
): GroupedEC2Resources => {
  for (const instance of resources) {
    const method = instance.purchaseMethod;
    groupedResources[method].EC2.push(instance);
  }

  return groupedResources;
};

const groupASG = (
  groupedResources: GroupedEC2Resources,
  asgs: AutoScalingGroup[],
): GroupedEC2Resources => {
  for (const asg of asgs) {
    const method = asg.purchaseMethod;
    groupedResources[method].ASG.push(asg);
  }

  return groupedResources;
};

const groupEKS = (
  groupedResources: GroupedEC2Resources,
  nodeGroups: EKSNodeGroup[],
): GroupedEC2Resources => {
  for (const nodeGroup of nodeGroups) {
    const method = nodeGroup.purchaseMethod;
    groupedResources[method].EKS.push(nodeGroup);
  }

  return groupedResources;
};

export const appendSavingsPlansOfferingRate = async (
  resources: EC2Resources,
): Promise<EC2ResourcesWithSavingsPlansOffering> => {
  const result: EC2ResourcesWithSavingsPlansOffering = {
    EC2: [],
    ASG: [],
    EKS: [],
  };

  const offeringMap = await getInstanceTypeSavingsPlansOfferingMap();

  for (const instance of resources.EC2) {
    const offering = offeringMap[instance.instanceType];
    if (typeof offering === 'undefined') {
      throw new Error(
        `Savings Plans Offering is not found for the EC2 instance: ${
          instance.instanceType
        }: ${JSON.stringify(instance)}`,
      );
    }
    result.EC2.push({ ...instance, savingsPlanOffering: offering });
  }
  for (const asg of resources.ASG) {
    const offering = offeringMap[asg.instanceType];
    if (typeof offering === 'undefined') {
      throw new Error(
        `Savings Plans Offering is not found for the Auto Scaling Groups: ${asg.name}`,
      );
    }
    result.ASG.push({ ...asg, savingsPlanOffering: offering });
  }
  for (const nodeGroup of resources.EKS) {
    const offering = offeringMap[nodeGroup.instanceTypes[0]];
    if (typeof offering === 'undefined') {
      throw new Error(
        `Savings Plans Offering is not found for the EKS Nodegroup: ${nodeGroup.clusterName}/${nodeGroup.name}`,
      );
    }
    result.EKS.push({ ...nodeGroup, savingsPlanOffering: offering });
  }

  return result;
};
