import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface ErpCompany {
  id: string;
  name: string;
  legalName: string | null;
  gstin: string | null;
  baseCurrency: string;
}

export interface ErpPlant {
  id: string;
  companyId: string;
  name: string;
  code: string;
  gstin: string | null;
}

interface PlantStore {
  company: ErpCompany | null;
  plant: ErpPlant | null;
  setCompany: (c: ErpCompany) => void;
  setPlant: (p: ErpPlant) => void;
  clear: () => void;
}

// Use sessionStorage so selection clears when the browser tab is closed.
// The auth token is handled separately via the httpOnly cookie.
export const usePlantStore = create<PlantStore>()(
  persist(
    (set) => ({
      company: null,
      plant: null,
      setCompany: (company) => set({ company, plant: null }),
      setPlant: (plant) => set({ plant }),
      clear: () => set({ company: null, plant: null }),
    }),
    {
      name: 'erp-plant',
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
