import {
  loadCalculatedResources,
  GroupedEC2Resources,
} from '../../aws/ec2/aggregator';
import { EC2PurchaseMethod } from '../../purchaseMethod';

const showAll = (groupedResources: GroupedEC2Resources): void => {
  console.log('# All of the running resources');
  console.log();

  for (const method of [
    'ComputeSavingsPlans',
    'EC2InstanceSavingsPlans',
    'SpotInstances',
    'Needless',
    'Undefined',
  ]) {
    const resources = groupedResources[method as EC2PurchaseMethod];

    console.log(`## ${method}`);
    console.log();
    console.log('* EC2 Instances');
    for (const instance of resources.EC2) {
      console.log(`  * ${instance.name} (${instance.instanceType})`);
    }
    console.log('* AutoScalingGroups');
    for (const asg of resources.ASG) {
      console.log(`  * ${asg.name} (${asg.instanceType} * ${asg.minSize})`);
    }
    console.log('* EKS Nodegroups');
    for (const nodeGroup of resources.EKS) {
      console.log(
        `  * ${nodeGroup.clusterName}/${nodeGroup.name} (${nodeGroup.instanceTypes[0]} * ${nodeGroup.minSize})`,
      );
    }

    console.log();
  }
};

(async () => {
  const groupedResources = await loadCalculatedResources();
  showAll(groupedResources);
})();
