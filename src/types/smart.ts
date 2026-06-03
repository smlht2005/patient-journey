// SMART on FHIR 與 session 共用型別

export interface SmartConfiguration {
  authorization_endpoint: string;
  token_endpoint: string;
  capabilities?: string[];
  code_challenge_methods_supported?: string[];
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  refresh_token?: string;
  id_token?: string;
  patient?: string; // SMART patient context
}

export interface SmartSession {
  iss?: string;
  tokenEndpoint?: string;
  authorizationEndpoint?: string;
  codeVerifier?: string;
  state?: string;
  accessToken?: string;
  refreshToken?: string;
  patientId?: string;
  expiresAt?: number; // epoch ms
  practitionerName?: string; // 登入醫師姓名（從 fhirUser claim 解析）
}
