/**
 * Meta Lead Ads Graph API Types & Interfaces
 */

export interface MetaLeadFieldData {
  name: string;
  values: string[];
}

export interface MetaLead {
  id: string;
  created_time: string;
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  form_id: string;
  field_data: MetaLeadFieldData[];
  is_organic?: boolean;
  platform?: "fb" | "ig" | string;
}

export interface MetaLeadPaging {
  cursors?: {
    before?: string;
    after?: string;
  };
  next?: string;
}

export interface MetaLeadgenForm {
  id: string;
  name: string;
  status: string;
  locale?: string;
  leads_count?: number;
  questions?: Array<{
    key?: string;
    label?: string;
    type?: string;
    options?: Array<{ key: string; value: string }>;
  }>;
}

export interface NormalizedLead {
  fullName: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone: string;
  childName?: string;
  instrument?: string;
  readiness?: string;
  platform: "fb" | "ig";
  adName?: string;
  campaignName?: string;
  customQuestions: Record<string, string>;
  createdTime: string;
}

export interface MetaWebhookChangeValue {
  leadgen_id: string;
  form_id: string;
  page_id: string;
  created_time: number;
  ad_id?: string;
  adgroup_id?: string;
}

export interface MetaWebhookChange {
  field: string;
  value: MetaWebhookChangeValue;
}

export interface MetaWebhookEntry {
  id: string;
  time: number;
  changes: MetaWebhookChange[];
}

export interface MetaWebhookPayload {
  object: "page" | string;
  entry: MetaWebhookEntry[];
}

export interface MetaConnectionStatus {
  configured: boolean;
  pageIdConfigured: boolean;
  tokenConfigured: boolean;
  appSecretConfigured: boolean;
  webhookTokenConfigured: boolean;
  validToken?: boolean;
  pageName?: string;
  pageAccess?: boolean;
  pageSubscribed?: boolean;
  permissions?: string[];
  missingPermissions?: string[];
  error?: string;
  graphVersion: string;
}

export interface MetaSyncResult {
  formId?: string;
  formName?: string;
  leadsFound: number;
  leadsInserted: number;
  leadsSkipped: number;
  status: "success" | "partial" | "failed";
  error?: string;
}
