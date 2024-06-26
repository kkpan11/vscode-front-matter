import { HomeIcon } from '@heroicons/react/24/outline';
import { basename, join } from 'path';
import * as React from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import { HOME_PAGE_NAVIGATION_ID } from '../../../constants';
import { parseWinPath } from '../../../helpers/parseWinPath';
import { SearchAtom, SettingsAtom } from '../../state';
import * as l10n from '@vscode/l10n';
import { LocalizationKey } from '../../../localization';
import useMediaFolder from '../../hooks/useMediaFolder';

export interface IBreadcrumbProps { }

export const Breadcrumb: React.FunctionComponent<IBreadcrumbProps> = (
  _: React.PropsWithChildren<IBreadcrumbProps>
) => {
  const { selectedFolder, updateFolder } = useMediaFolder();
  const [, setSearchValue] = useRecoilState(SearchAtom);
  const [folders, setFolders] = React.useState<string[]>([]);
  const settings = useRecoilValue(SettingsAtom);

  const updateMediaFolder = React.useCallback((folder: string) => {
    setSearchValue('');
    updateFolder(folder);
  }, [updateFolder, setSearchValue]);

  React.useEffect(() => {
    if (!settings) {
      return;
    }

    const { wsFolder, staticFolder, contentFolders } = settings;

    const isValid = (folderPath: string) => {
      if (staticFolder) {
        const staticPath = parseWinPath(join(wsFolder, staticFolder)) as string;
        const relPath = folderPath.replace(staticPath, '') as string;

        if (relPath.length > 1 && folderPath.startsWith(staticPath)) {
          return true;
        } else if (relPath.length === 0) {
          return false;
        }
      }

      let valid = false;
      for (let i = 0; i < contentFolders.length; i++) {
        const folder = contentFolders[i];
        const contentFolder = parseWinPath(folder.path) as string;
        const relContentPath = folderPath.replace(contentFolder, '');

        if (!valid) {
          valid = relContentPath.length > 1 && folderPath.startsWith(contentFolder);
        }
      }

      return valid;
    };

    if (!selectedFolder) {
      setFolders([]);
    } else {
      const relPath = parseWinPath(
        selectedFolder.replace(parseWinPath(settings.wsFolder) as string, '')
      ) as string;
      const folderParts = relPath.split('/').filter((f) => f);
      const allFolders: string[] = [];
      let previousFolder = parseWinPath(settings.wsFolder) as string;

      for (const part of folderParts) {
        const folder = join(previousFolder, part);
        if (isValid(folder)) {
          allFolders.push(folder);
        }
        previousFolder = folder;
      }

      setFolders(allFolders);
    }
  }, [selectedFolder, settings]);

  return (
    <ol role="list" className="flex space-x-2 px-4 flex-1">
      <li className="flex">
        <div className="flex items-center">
          <button
            onClick={() => updateMediaFolder(HOME_PAGE_NAVIGATION_ID)}
            className={`text-[var(--vscode-tab-inactiveForeground)] hover:text-[var(--vscode-tab-activeForeground)]`}
          >
            <HomeIcon className="flex-shrink-0 h-5 w-5" aria-hidden="true" />
            <span className="sr-only">{l10n.t(LocalizationKey.dashboardHeaderBreadcrumbHome)}</span>
          </button>
        </div>
      </li>

      {folders.map((folder) => (
        <li key={folder} className="flex">
          <div className="flex items-center">
            <svg
              className={`flex-shrink-0 h-5 w-5 text-[var(--vscode-tab-inactiveForeground)]`}
              xmlns="http://www.w3.org/2000/svg"
              fill="currentColor"
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path d="M5.555 17.776l8-16 .894.448-8 16-.894-.448z" />
            </svg>

            <button
              onClick={() => updateMediaFolder(folder)}
              className={`ml-2 text-sm font-medium text-[var(--vscode-tab-inactiveForeground)] hover:text-[var(--vscode-tab-activeForeground)]`}
            >
              {basename(folder)}
            </button>
          </div>
        </li>
      ))}
    </ol>
  );
};
