import { ContentType, SNFile } from '@standardnotes/snjs';
import { FunctionComponent } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { observer } from 'mobx-react-lite';
import { WebApplication } from '@/ui_models/application';
import { AppState } from '@/ui_models/app_state';

type Props = {
  application: WebApplication;
  appState: AppState;
};

export const FilesContainer: FunctionComponent<Props> = observer(
  ({ application, appState }) => {
    const [files, setFiles] = useState<SNFile[]>([]);

    useEffect(() => {
      const files = application.getItems(ContentType.File) as SNFile[];
      setFiles(files);
    }, [application]);

    return (
      <div className={`flex flex-col w-full h-full focus:shadow-none`}>
        {files.map((file) => {
          return (
            <div>
              {file.nameWithExt}
              <button onClick={() => appState.files.downloadFile(file)}>
                Download
              </button>
            </div>
          );
        })}
      </div>
    );
  }
);
