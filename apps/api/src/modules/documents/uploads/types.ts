export interface UploadInput{
    filename: string;
    contentType: string;
    dataUrl: string;
}

export interface UploadResult{
    url: string;
    filename: string;
    contentType: string;
    sizeBytes: number;
}