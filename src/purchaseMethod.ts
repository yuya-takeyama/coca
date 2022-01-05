export type EC2PurchaseMethod =
  | 'ComputeSavingsPlans'
  | 'EC2InstanceSavingsPlans'
  | 'SpotInstances'
  | 'Needless'
  | 'Undefined';

export type RDSPurchaseMethod = 'ReservedInstance' | 'Needless' | 'Undefined';
