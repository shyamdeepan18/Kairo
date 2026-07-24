import { api } from './client';
import type { ErpCompany, ErpPlant } from '../store/plant';

export const companiesApi = {
  list: async (): Promise<ErpCompany[]> => {
    const res = await api.get<{ companies: ErpCompany[] }>('/companies');
    return res.data.companies;
  },

  listPlants: async (companyId: string): Promise<ErpPlant[]> => {
    const res = await api.get<{ plants: ErpPlant[] }>(`/companies/${companyId}/plants`);
    return res.data.plants;
  },
};
