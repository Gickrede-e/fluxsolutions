export interface UserDto {
  id: string;
  email: string;
  role: 'USER' | 'ADMIN';
  banned?: boolean;
  createdAt?: string;
}

export interface FolderDto {
  id: string;
  ownerId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface FileDto {
  id: string;
  ownerId: string;
  folderId: string | null;
  filename: string;
  size: number;
  mime: string;
  checksum: string | null;
  createdAt: string;
  deletedAt: string | null;
  scanStatus: 'PENDING' | 'CLEAN' | 'INFECTED' | 'DISABLED';
  folder?: { id: string; name: string } | null;
}

export interface ShareMetadataDto {
  token: string;
  file: {
    id: string;
    filename: string;
    size: number;
    mime: string;
    scanStatus: 'PENDING' | 'CLEAN' | 'INFECTED' | 'DISABLED';
  };
  passwordRequired: boolean;
  expiresAt: string | null;
  oneTime: boolean;
  maxDownloads: number | null;
  downloadsCount: number;
  availability: {
    available: boolean;
    reason:
      | 'ok'
      | 'expired'
      | 'download_limit_reached'
      | 'one_time_consumed'
      | 'file_deleted'
      | 'file_pending_scan'
      | 'file_infected';
  };
}
