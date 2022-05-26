import { ModeListener } from './../listeners/general/ModeListener';
import { PagesListener } from './../listeners/dashboard';
import { ArticleHelper, Settings } from ".";
import { FEATURE_FLAG, SETTING_CONTENT_DRAFT_FIELD, SETTING_DATE_FORMAT, SETTING_FRAMEWORK_ID, SETTING_TAXONOMY_CONTENT_TYPES, TelemetryEvent } from "../constants";
import { ContentType as IContentType, DraftField, Field } from '../models';
import { Uri, commands, window } from 'vscode'; 
import { Folders } from "../commands/Folders";
import { Questions } from "./Questions";
import { existsSync, writeFileSync } from "fs";
import { Notifications } from "./Notifications";
import { DEFAULT_CONTENT_TYPE_NAME } from "../constants/ContentType";
import { Telemetry } from './Telemetry';
import { processKnownPlaceholders } from './PlaceholderHelper';
import { basename } from 'path';

export class ContentType {

  /**
   * Retrieve the draft field
   * @returns 
   */
  public static getDraftField() {
    const draftField = Settings.get<DraftField | null | undefined>(SETTING_CONTENT_DRAFT_FIELD);
    if (draftField) {
      return draftField;
    }

    return null;
  }

  /**
   * Retrieve the field its status
   * @param data 
   * @returns 
   */
  public static getDraftStatus(data: { [field: string]: any }) {
    const contentType = ArticleHelper.getContentType(data);
    const draftSetting = ContentType.getDraftField();

    const draftField = contentType.fields.find(f => f.type === "draft");

    let fieldValue = null;

    if (draftField) {
      fieldValue = data[draftField.name];
    } else if (draftSetting && data && data[draftSetting.name]) {
      fieldValue = data[draftSetting.name];
    }

    if (draftSetting && fieldValue) {
      if (draftSetting.type === "boolean") {
        return fieldValue ? "Draft" : "Published";
      } else {
        return fieldValue;
      }
    }

    return null;
  }

  /**
   * Create content based on content types
   * @returns 
   */
  public static async createContent() {
    const selectedContentType = await Questions.SelectContentType();
    if (!selectedContentType) {
      return;
    }

    const selectedFolder = await Questions.SelectContentFolder();
    if (!selectedFolder) {
      return;
    }

    const contentTypes = ContentType.getAll();
    const folders = Folders.get();

    const location = folders.find(f => f.title === selectedFolder);
    if (contentTypes && location) {
      const folderPath = Folders.getFolderPath(Uri.file(location.path));
      const contentType = contentTypes.find(ct => ct.name === selectedContentType);
      if (folderPath && contentType) {
        ContentType.create(contentType, folderPath);
      }
    }
  }

  /**
   * Retrieve all content types
   * @returns 
   */
  public static getAll() {
    return Settings.get<IContentType[]>(SETTING_TAXONOMY_CONTENT_TYPES);
  }

  /**
   * Generate a content type
   */
  public static async generate() {
    if (!(await ContentType.verify())) {
      return;
    }

    Telemetry.send(TelemetryEvent.generateContentType);

    const content = ArticleHelper.getCurrent();

    const editor = window.activeTextEditor;
    const filePath = editor?.document.uri.fsPath;

    if (!content || !content.data) {
      Notifications.warning(`No front matter data found to generate a content type.`);
      return;
    }

    const override = await window.showQuickPick(["Yes", "No"], {
      placeHolder: "Do you want to override the default content type?",
      ignoreFocusOut: true,
      title: "Override default content type"
    });
    const overrideBool = override === "Yes";

    let contentTypeName: string | undefined = `default`;

    // Ask for the new content type name
    if (!overrideBool) {
      contentTypeName = await window.showInputBox({
        ignoreFocusOut: true,
        placeHolder: "Enter the name of the content type to generate",
        prompt: "Enter the name of the content type to generate",
        title: "Generate Content Type",
        validateInput: (value: string) => {
          if (!value) {
            return "Please enter a name for the content type";
          }
  
          const contentTypes = ContentType.getAll();
          if (contentTypes && contentTypes.find(ct => ct.name.toLowerCase() === value.toLowerCase())) {
            return "A content type with this name already exists";
          }
  
          return null;
        }
      });
  
      if (!contentTypeName) {
        Notifications.warning(`You didn't specify a name for the content type.`);
        return;
      }
    }

    // Ask if the content type needs to be used as a page bundle
    let pageBundle = false;
    const fileName = filePath ? basename(filePath) : undefined;
    if (fileName?.startsWith(`index.`)) {
      const pageBundleAnswer = await window.showQuickPick(["Yes", "No"], {
        placeHolder: "Do you want to use this content type as a page bundle?",
        ignoreFocusOut: true,
        title: "Use as page bundle"
      });
      pageBundle = pageBundleAnswer === "Yes";
    }

    const fields = ContentType.generateFields(content.data);
    if (!overrideBool && !fields.some(f => f.name === "type")) {
      fields.push({
        name: "type",
        type: "string",
        default: contentTypeName,
        hidden: true
      } as Field);
    }

    // Update the type field in the page
    if (!overrideBool && editor) {
      content.data["type"] = contentTypeName;
      ArticleHelper.update(editor, content);
    }
    
    const newContentType: IContentType = {
      name: contentTypeName,
      pageBundle,
      fields
    };

    const contentTypes = ContentType.getAll() || [];
    
    if (overrideBool) {
      const index = contentTypes.findIndex(ct => ct.name === contentTypeName);
      contentTypes[index].fields = fields;
    } else {
      contentTypes.push(newContentType);
    }

    Settings.update(SETTING_TAXONOMY_CONTENT_TYPES, contentTypes, true);

    const configPath = Settings.projectConfigPath;
    const notificationAction = await Notifications.info(`Content type ${contentTypeName} has been ${overrideBool ? `updated` : `generated`}.`, configPath && existsSync(configPath) ?  `Open settings` : undefined);

    if (notificationAction === "Open settings" && configPath && existsSync(configPath)) {
      commands.executeCommand('vscode.open', Uri.file(configPath));
    }
  }

  /**
   * Add missing fields to the content type
   */
  public static async addMissingFields() {
    if (!(await ContentType.verify())) {
      return;
    }

    Telemetry.send(TelemetryEvent.addMissingFields);

    const content = ArticleHelper.getCurrent();

    if (!content || !content.data) {
      Notifications.warning(`No front matter data found to add missing fields.`);
      return;
    }

    const contentType = ArticleHelper.getContentType(content?.data);
    const updatedFields = ContentType.generateFields(content.data, contentType.fields);

    const contentTypes = ContentType.getAll() || [];
    const index = contentTypes.findIndex(ct => ct.name === contentType.name);
    contentTypes[index].fields = updatedFields;

    Settings.update(SETTING_TAXONOMY_CONTENT_TYPES, contentTypes, true);

    const configPath = Settings.projectConfigPath;
    const notificationAction = await Notifications.info(`Content type ${contentType.name} has been updated.`, configPath && existsSync(configPath) ?  `Open settings` : undefined);

    if (notificationAction === "Open settings" && configPath && existsSync(configPath)) {
      commands.executeCommand('vscode.open', Uri.file(configPath));
    }
  }

  /**
   * Set the content type to be used for the current file
   */
  public static async setContentType() {
    if (!(await ContentType.verify())) {
      return;
    }

    Telemetry.send(TelemetryEvent.setContentType);

    const content = ArticleHelper.getCurrent();
    const contentTypes = ContentType.getAll() || [];

    if (!content || !content.data) {
      Notifications.warning(`No front matter data found to set the content type.`);
      return;
    }
    
    const ctAnswer = await window.showQuickPick(contentTypes.map(ct => ct.name), {
      title: "Select the content type",
      ignoreFocusOut: true,
      placeHolder: "Which content type would you like to use?"
    });

    if (!ctAnswer) {
      return;
    }
    
    content.data.type = ctAnswer;

    const editor = window.activeTextEditor;
    ArticleHelper.update(editor!, content);
  }

  /**
   * Generate the fields from the data
   * @param data 
   * @param fields 
   * @returns 
   */
  private static generateFields(data: any, fields: any[] = []) {
    for (const field in data) {
      const fieldData = data[field];

      if (fields.some(f => f.name === field)) {
        continue;
      }

      if (fieldData && fieldData instanceof Array && fieldData.length > 0 && typeof fieldData[0] === "string") {
        if (field.toLowerCase() === "tag" || field.toLowerCase() === "tags") {
          fields.push({
            title: field,
            name: field,
            type: "tags",
          } as Field);
        } else if (field.toLowerCase() === "category" || field.toLowerCase() === "categories") {
          fields.push({
            title: field,
            name: field,
            type: "categories",
          } as Field);
        } else {
          fields.push({
            title: field,
            name: field,
            type: "choice",
            choices: fieldData
          } as Field);
        }
      } else if (fieldData && fieldData instanceof Array && fieldData.length > 0 && typeof fieldData[0] === "object") {
        const newFields = ContentType.generateFields(fieldData);
        fields.push({
          title: field,
          name: field,
          type: "block",
          fields: newFields
        } as Field);
      } else if (fieldData && fieldData instanceof Object) {
        const newFields = ContentType.generateFields(fieldData);
        fields.push({
          title: field,
          name: field,
          type: "fields",
          fields: newFields
        } as Field);
      } else {
        if (!isNaN(new Date(fieldData).getDate())) {
          fields.push({
            title: field,
            name: field,
            type: "datetime"
          } as Field);
        } else if (field.toLowerCase() === "draft") {
          fields.push({
            title: field,
            name: field,
            type: "draft"
          } as Field);
        } else if (field.toLowerCase() === "slug") {
          // Do nothing
        } else {
          fields.push({
            title: field,
            name: field,
            type: typeof fieldData
          } as Field);
        }
      }
    }

    return fields;
  }

  /**
   * Create a new file with the specified content type
   * @param contentType 
   * @param folderPath 
   * @returns 
   */
  private static async create(contentType: IContentType, folderPath: string) {
    const titleValue = await Questions.ContentTitle();
    if (!titleValue) {
      return;
    }

    let newFilePath: string | undefined = ArticleHelper.createContent(contentType, folderPath, titleValue);
    if (!newFilePath) {
      return;
    }

    if (contentType.name === "default") {
      const crntFramework = Settings.get<string>(SETTING_FRAMEWORK_ID);
      if (crntFramework?.toLowerCase() === "jekyll") {
        const idx = contentType.fields.findIndex(f => f.name === "draft");
        if (idx > -1) {
          contentType.fields.splice(idx, 1);
        }
      }
    }

    let data: any = this.processFields(contentType, titleValue, {});

    data = ArticleHelper.updateDates(Object.assign({}, data));

    if (contentType.name !== DEFAULT_CONTENT_TYPE_NAME) {
      data['type'] = contentType.name;
    }

    const content = ArticleHelper.stringifyFrontMatter(``, data);

    writeFileSync(newFilePath, content, { encoding: "utf8" });

    await commands.executeCommand('vscode.open', Uri.file(newFilePath));

    Notifications.info(`Your new content has been created.`);

    Telemetry.send(TelemetryEvent.createContentFromContentType);

    // Trigger a refresh for the dashboard
    PagesListener.refresh();
  }

  /**
   * Process all content type fields
   * @param contentType 
   * @param data 
   */
  private static processFields(obj: IContentType | Field, titleValue: string, data: any) {
    
    if (obj.fields) {
      const dateFormat = Settings.get(SETTING_DATE_FORMAT) as string;
      for (const field of obj.fields) {
        if (field.name === "title") {
          if (field.default) {
            data[field.name] = processKnownPlaceholders(field.default, titleValue, dateFormat);
            data[field.name] = ArticleHelper.processCustomPlaceholders(data[field.name], titleValue);
          } else {
            data[field.name] = titleValue;
          }
        } else {
          if (field.type === "fields") {
            data[field.name] = this.processFields(field, titleValue, {});
          } else {
            const defaultValue = field.default;

            if (typeof defaultValue === "string") {
              data[field.name] = processKnownPlaceholders(defaultValue, titleValue, dateFormat);
              data[field.name] = ArticleHelper.processCustomPlaceholders(data[field.name], titleValue);
            } else {
              data[field.name] = typeof defaultValue !== "undefined" ? defaultValue : "";
            }
          }
        }
      }
    }

    return data;
  }

  /**
   * Verify if the content type feature is enabled
   * @returns 
   */
  private static async verify() {
    const hasFeature = await ModeListener.hasFeature(FEATURE_FLAG.panel.contentType);
    if (!hasFeature) {
      Notifications.warning(`The content type actions are not available in this mode.`);
      return false;
    }

    return true;
  }
}