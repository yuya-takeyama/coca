import {
  EKSClient,
  Cluster as SDKCluster,
  Nodegroup as SDKNodeGroup,
  DescribeClusterCommand,
  ListClustersCommand,
  ListNodegroupsCommand,
  DescribeNodegroupCommand,
} from '@aws-sdk/client-eks';
import {
  DescribeLaunchTemplateVersionsCommand,
  EC2Client,
} from '@aws-sdk/client-ec2';
import { EC2PurchaseMethod } from '../../purchaseMethod';

const client = new EKSClient({});
const ec2Client = new EC2Client({});

export type EKSNodeGroup = {
  name: string;
  clusterName: string;
  instanceTypes: string[];
  minSize: number;
  purchaseMethod: EC2PurchaseMethod;
};

export const loadEKSNodegroups = async (): Promise<EKSNodeGroup[]> => {
  const clusters = await getLatestReadyClusters();
  const clustersAndNodegroups: [SDKCluster, SDKNodeGroup[]][] =
    await Promise.all(
      clusters.map(async (cluster): Promise<[SDKCluster, SDKNodeGroup[]]> => {
        const nodegroups = await getNodegroupsByCluster(cluster);
        return [cluster, nodegroups];
      }),
    );
  const flatClusterAndNodegroups = flattenEKSClustersAndNodegroups(
    clustersAndNodegroups,
  );
  return loadInstanceTypesIntoFlatEKSClustersAndNodegroups(
    flatClusterAndNodegroups,
  );
};

const flattenEKSClustersAndNodegroups = (
  clustersAndNodegroups: [SDKCluster, SDKNodeGroup[]][],
): [SDKCluster, SDKNodeGroup][] => {
  return clustersAndNodegroups.reduce<[SDKCluster, SDKNodeGroup][]>(
    (acc, clusterAndNodegroups) => {
      const [cluster, nodegroups] = clusterAndNodegroups;

      return [
        ...acc,
        ...nodegroups.map<[SDKCluster, SDKNodeGroup]>((nodegroup) => [
          cluster,
          nodegroup,
        ]),
      ];
    },
    [],
  );
};

const loadInstanceTypesIntoFlatEKSClustersAndNodegroups = async (
  clustersAndNodegroups: [SDKCluster, SDKNodeGroup][],
): Promise<EKSNodeGroup[]> => {
  return await Promise.all(
    clustersAndNodegroups.map(
      async (clusterAndNodegroup): Promise<EKSNodeGroup> => {
        const [cluster, nodegroup] = clusterAndNodegroup;
        if (nodegroup.instanceTypes) {
          return toEKSNodeGroup({
            cluster,
            nodegroup,
            instanceTypes: nodegroup.instanceTypes,
          });
        } else {
          const instanceTypes = await getInstanceTypesFromEKSNodegroup(
            nodegroup,
          );

          return toEKSNodeGroup({ cluster, nodegroup, instanceTypes });
        }
      },
    ),
  );
};

type toEKSNodeGroupInput = {
  cluster: SDKCluster;
  nodegroup: SDKNodeGroup;
  instanceTypes: string[];
};
const toEKSNodeGroup = ({
  cluster,
  nodegroup,
  instanceTypes,
}: toEKSNodeGroupInput): EKSNodeGroup => {
  return {
    name: nodegroup.nodegroupName!,
    clusterName: cluster.name!,
    minSize: nodegroup.scalingConfig!.minSize!,
    instanceTypes,
    purchaseMethod: getReservationPurchaseMethod(nodegroup),
  };
};

const getReservationPurchaseMethod = (
  nodegroup: SDKNodeGroup,
): EC2PurchaseMethod => {
  const method = getTagValue(nodegroup, 'ReservationPurchaseMethod');

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

const getTagValue = (
  nodegroup: SDKNodeGroup,
  tagKey: string,
): string | undefined => {
  if (nodegroup.tags) {
    for (const [key, value] of Object.entries(nodegroup.tags)) {
      if (key === tagKey) {
        return value;
      }
    }
  }
};

const getInstanceTypesFromEKSNodegroup = async (
  nodegroup: SDKNodeGroup,
): Promise<string[]> => {
  if (nodegroup.launchTemplate?.id && nodegroup.launchTemplate.version) {
    const describeLaunchTemplateVersionsResult = await ec2Client.send(
      new DescribeLaunchTemplateVersionsCommand({
        LaunchTemplateId: nodegroup.launchTemplate.id,
        Versions: [nodegroup.launchTemplate.version],
      }),
    );
    return describeLaunchTemplateVersionsResult.LaunchTemplateVersions!.map(
      (lt) => lt.LaunchTemplateData?.InstanceType!,
    );
  } else {
    throw new Error(`Launch Template is not set: ${nodegroup.nodegroupName}`);
  }
};

const getLatestReadyClusters = async (): Promise<SDKCluster[]> => {
  const listClustersResult = await client.send(new ListClustersCommand({}));
  const describeClusterPromises = listClustersResult.clusters!.map((name) =>
    client.send(new DescribeClusterCommand({ name })),
  );
  const describeClusterResults = await Promise.all(describeClusterPromises);
  return describeClusterResults
    .filter((clusterRes) => {
      const cluster = clusterRes.cluster;
      return (
        cluster?.tags!['quipper/ready'] === 'true' &&
        cluster?.tags!['quipper/latest'] === 'true'
      );
    })
    .map((clusterRes) => clusterRes.cluster!);
};

const getNodegroupsByCluster = async (
  cluster: SDKCluster,
): Promise<SDKNodeGroup[]> => {
  const listNodegroupsResult = await client.send(
    new ListNodegroupsCommand({ clusterName: cluster.name }),
  );
  const nodegroupNames = listNodegroupsResult.nodegroups!;
  const describeNodegroupPromises = nodegroupNames.map((name) =>
    client.send(
      new DescribeNodegroupCommand({
        clusterName: cluster.name!,
        nodegroupName: name,
      }),
    ),
  );
  const describeNodegroupResults = await Promise.all(describeNodegroupPromises);
  return describeNodegroupResults.map((result) => result.nodegroup!);
};
