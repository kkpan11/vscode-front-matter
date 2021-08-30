import { VersionInfo } from '../../models/VersionInfo';
import { ContentFolder } from './../../models/ContentFolder';

export interface Settings { 
  folders: ContentFolder[]; 
  initialized: boolean 
  tags: string[];
  categories: string[];
  openOnStart: boolean | null;
  versionInfo: VersionInfo;
}