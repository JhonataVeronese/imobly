export type ContactStatus = "active" | "opted_out" | "blocked";

export type ContactPreferences = {
  propertyTypes?: string[];
  cities?: string[];
  neighborhoods?: string[];
  priceMin?: number;
  priceMax?: number;
  bedroomsMin?: number;
  investor?: boolean;
};

export type ContactListItem = {
  id: string;
  name: string;
  phoneE164: string;
  source: string | null;
  status: ContactStatus;
  preferences: ContactPreferences;
  tags: string[];
  createdAt: string;
  hasConsent: boolean;
  consents: { id: string; source: string; grantedAt: string }[];
};

export type ContactsPage = {
  items: ContactListItem[];
  total: number;
  page: number;
};

export type ContactCreatePayload = {
  name: string;
  phone: string;
  preferences?: ContactPreferences;
  tags?: string[];
};

export type ConsentPayload = {
  source: string;
  evidenceReference: string;
  overrideSuppression?: boolean;
};

export type ImportReport = {
  total: number;
  created: number;
  updated: number;
  consentsRecorded: number;
  skippedSuppressedConsent: number;
  invalid: { line: number; reason: string }[];
};

export type SuppressionEntry = {
  id: string;
  phoneE164: string;
  reason: string;
  source: string;
  campaignId: string | null;
  createdAt: string;
};
