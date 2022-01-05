import {
  SavingsplansClient,
  SavingsPlan as SDKSavingsPlan,
  SavingsPlanOffering as SDKSavingsPlanOffering,
  SavingsPlanOfferingRate as SDKSavingsPlanOfferingRate,
  DescribeSavingsPlansCommand,
  DescribeSavingsPlansOfferingRatesCommand,
} from '@aws-sdk/client-savingsplans';

export type SavingsPlanOffering = {
  rate: number;
};

export interface WithSavingsPlanOffering {
  savingsPlanOffering: SavingsPlanOffering;
}

interface InstanceTypeOfferingMap {
  [key: string]: SavingsPlanOffering;
}

// All of the regions can be retrieved from us-east-1 endpoint
const client = new SavingsplansClient({ region: 'us-east-1' });

export const getInstanceTypeSavingsPlansOfferingMap =
  async (): Promise<InstanceTypeOfferingMap> => {
    const offeringMap: { [instanceType: string]: SavingsPlanOffering } = {};

    const region = process.env.AWS_REGION;
    if (!region) {
      throw new Error('AWS_REGION is not set');
    }

    let nextToken = '';
    while (true) {
      const nextTokenCondition = nextToken ? { nextToken } : {};
      const describeSavingsPlansOfferingRatesResult = await client.send(
        new DescribeSavingsPlansOfferingRatesCommand({
          savingsPlanPaymentOptions: ['All Upfront'],
          savingsPlanTypes: ['Compute'],
          products: ['EC2'],
          filters: [
            { name: 'tenancy', values: ['shared'] },
            { name: 'region', values: [region] },
            { name: 'productDescription', values: ['Linux/UNIX'] },
          ],
          ...nextTokenCondition,
        }),
      );
      for (const offeringRate of describeSavingsPlansOfferingRatesResult.searchResults!) {
        // 1 year
        if (offeringRate.savingsPlanOffering?.durationSeconds !== 31536000) {
          continue;
        }

        const instanceType = getProperty(offeringRate, 'instanceType');
        if (typeof instanceType === 'undefined') {
          throw new Error(
            `Invalid Savings Plans Offering: ${JSON.stringify(offeringRate)}`,
          );
        }
        offeringMap[instanceType] = toSavingsPlanOffering(offeringRate);
      }

      if (describeSavingsPlansOfferingRatesResult.nextToken) {
        nextToken = describeSavingsPlansOfferingRatesResult.nextToken;
      } else {
        break;
      }
    }

    return offeringMap;
  };

const toSavingsPlanOffering = (
  input: SDKSavingsPlanOfferingRate,
): SavingsPlanOffering => {
  return {
    rate: Number(input.rate),
  };
};

const getProperty = (offering: SDKSavingsPlanOffering, name: string) => {
  for (const property of offering.properties!) {
    if (property.name === name) {
      return property.value;
    }
  }
};

export type SavingsPlan = {
  id: string;
  commitment: string;
  end: string;
};

export const getActiveComputeSavingsPlans = async (): Promise<
  SavingsPlan[]
> => {
  const result: SavingsPlan[] = [];

  let nextToken = '';
  while (true) {
    const nextTokenCondition = nextToken ? { nextToken } : {};
    const describeSavingsPlansResult = await client.send(
      new DescribeSavingsPlansCommand({
        states: ['active'],
        ...nextTokenCondition,
      }),
    );

    for (const savingsPlan of describeSavingsPlansResult.savingsPlans!) {
      if (savingsPlan.savingsPlanType === 'Compute') {
        result.push(toSavingsPlan(savingsPlan));
      }
    }

    if (describeSavingsPlansResult.nextToken) {
      nextToken = describeSavingsPlansResult.nextToken;
    } else {
      break;
    }
  }

  return result;
};

const toSavingsPlan = (input: SDKSavingsPlan): SavingsPlan => {
  if (!input.savingsPlanId) {
    throw new Error(`SavingsPlan should have a savingsPlanId`);
  }
  if (!input.commitment) {
    throw new Error(
      `SavingsPlan should have a commitment: ${input.savingsPlanId}`,
    );
  }
  if (!input.end) {
    throw new Error(`SavingsPlan should have an end: ${input.savingsPlanId}`);
  }
  return {
    id: input.savingsPlanId,
    commitment: input.commitment,
    end: input.end,
  };
};
