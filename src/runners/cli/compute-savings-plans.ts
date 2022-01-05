import {
  loadCalculatedResources,
  appendSavingsPlansOfferingRate,
  EC2ResourcesWithSavingsPlansOffering,
} from '../../aws/ec2/aggregator';
import {
  getActiveComputeSavingsPlans,
  SavingsPlan,
} from '../../aws/ec2/savingsPlans';

const showComputeSavingsPlans = (
  resourcesWithOfferings: EC2ResourcesWithSavingsPlansOffering,
  activeSavingsPlans: SavingsPlan[],
): void => {
  console.log('# Resources to purchase with Compute Savings Plans');
  console.log();
  console.log('## Running Resources');
  console.log();

  let runningResourcesAmount = 0;
  let activeAmount = 0;

  console.log('* EC2 Instances');
  for (const {
    savingsPlanOffering,
    ...instance
  } of resourcesWithOfferings.EC2) {
    let amount = Number(savingsPlanOffering.rate);
    runningResourcesAmount += amount;
    console.log(
      `  * ${instance.name} (${instance.instanceType}) => $${amount}/hour`,
    );
  }

  console.log('* Auto Scaling Groups');
  for (const { savingsPlanOffering, ...asg } of resourcesWithOfferings.ASG) {
    const amount = Number(savingsPlanOffering.rate) * asg.minSize;
    runningResourcesAmount += amount;
    console.log(
      `  * ${asg.name} (${asg.instanceType} * ${asg.minSize}) => $${savingsPlanOffering.rate}/hour * ${asg.minSize} = $${amount}/hour`,
    );
  }

  console.log('* EKS Nodegroups');
  for (const {
    savingsPlanOffering,
    ...nodegroup
  } of resourcesWithOfferings.EKS) {
    const amount = Number(savingsPlanOffering.rate) * nodegroup.minSize;
    runningResourcesAmount += amount;
    console.log(
      `  * ${nodegroup.clusterName}/${nodegroup.name} (${nodegroup.instanceTypes[0]} * ${nodegroup.minSize}) => $${savingsPlanOffering.rate}/hour * ${nodegroup.minSize} = $${amount}/hour`,
    );
  }

  console.log();
  console.log(`Total: $${runningResourcesAmount}/hour`);
  console.log();

  console.log('# Active Savings Plans');
  console.log();

  for (const activeSavingsPlan of activeSavingsPlans) {
    const amount = Number(activeSavingsPlan.commitment);
    activeAmount += amount;
    console.log(
      `* ${activeSavingsPlan.id}: $${amount}/hour (Until: ${activeSavingsPlan.end})`,
    );
  }

  console.log();
  console.log(`Total: $${activeAmount}/hour`);
  console.log();

  console.log('# Purchase Required Amount');
  console.log();

  const purchaseRequiredAmount = runningResourcesAmount - activeAmount;

  if (purchaseRequiredAmount > 0) {
    console.log(
      `You need to purchase additional $${purchaseRequiredAmount}/hour`,
    );
  } else if (purchaseRequiredAmount < 0) {
    console.log(
      `Over purchased $${Math.abs(
        purchaseRequiredAmount,
      )}/hour of Savings Plans!`,
    );
  } else {
    console.log('You have already purchased required Savings Plans');
  }
};

(async () => {
  const groupedResources = await loadCalculatedResources();
  const savingsPlansResourcesWithOfferingRate =
    await appendSavingsPlansOfferingRate(groupedResources.ComputeSavingsPlans);
  const activeSavingsPlans = await getActiveComputeSavingsPlans();

  showComputeSavingsPlans(
    savingsPlansResourcesWithOfferingRate,
    activeSavingsPlans,
  );
})();
