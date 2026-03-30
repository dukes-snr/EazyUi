import * as React from "react";
import { Upload, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface ImageUploaderProps {
  files: File[];
  onChange: (files: File[]) => void;
  maxFiles?: number;
  maxSize?: number;
  accept?: string;
  compact?: boolean;
  className?: string;
}

export const ImageUploader = React.forwardRef<HTMLDivElement, ImageUploaderProps>(
  (
    {
      files,
      onChange,
      maxFiles = 5,
      maxSize = 4,
      accept = "image/*",
      compact = false,
      className,
      ...props
    },
    ref
  ) => {
    const [isDragging, setIsDragging] = React.useState(false);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const previewUrls = React.useMemo(
      () => files.map((file) => URL.createObjectURL(file)),
      [files]
    );

    React.useEffect(() => {
      return () => {
        previewUrls.forEach((url) => URL.revokeObjectURL(url));
      };
    }, [previewUrls]);

    const handleFileChange = (newFiles: FileList | null) => {
      if (!newFiles) return;

      const filesArray = Array.from(newFiles).filter((file) => {
        if (file.size > maxSize * 1024 * 1024) return false;
        return !files.some((existingFile) => existingFile.name === file.name);
      });

      const updatedFiles = [...files, ...filesArray].slice(0, maxFiles);
      onChange(updatedFiles);
    };

    const handleRemoveFile = (index: number) => {
      const updatedFiles = files.filter((_, i) => i !== index);
      onChange(updatedFiles);
    };

    const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      handleFileChange(e.dataTransfer.files);
    };

    return (
      <div ref={ref} className={cn("space-y-4", className)} {...props}>
        <div
          className={cn(
            compact
              ? "cursor-pointer rounded-[18px] border border-dashed px-3.5 py-3 text-left transition-colors duration-300"
              : "cursor-pointer rounded-[24px] border-2 border-dashed p-8 text-center transition-colors duration-300",
            isDragging
              ? "border-primary bg-primary/10"
              : "border-muted-foreground/20 bg-transparent"
          )}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          aria-label="Image uploader dropzone"
          tabIndex={0}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={accept}
            className="hidden"
            onChange={(e) => handleFileChange(e.target.files)}
          />
          <div className={cn("flex gap-4", compact ? "items-center" : "flex-col items-center")}>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={cn(
                "rounded-full border-[color:color-mix(in_srgb,var(--ui-primary)_18%,var(--ui-border))] bg-[color:color-mix(in_srgb,var(--ui-primary)_10%,var(--ui-surface-1))] text-[var(--ui-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_16%,var(--ui-surface-1))] hover:text-[var(--ui-primary)]",
                compact ? "h-9 w-9 shrink-0" : "h-14 w-14"
              )}
            >
              <Upload className={cn(compact ? "h-5 w-5" : "h-6 w-6")} />
            </Button>
            <div className={cn(compact ? "min-w-0" : "")}>
              <p className={cn("text-foreground", compact ? "text-[13px] font-medium leading-5" : "font-medium")}>
                {compact ? "Add more images" : "Choose images or drag and drop them here"}
              </p>
              <p className={cn("text-muted-foreground", compact ? "text-[11px] leading-4" : "text-sm")}>
                {compact ? `Drop or browse. Max ${maxSize}MB.` : `JPG, JPEG, PNG, and WEBP. Max ${maxSize}MB.`}
              </p>
            </div>
          </div>
        </div>

        {previewUrls.length > 0 && (
          <div className={cn("grid gap-4", compact ? "grid-cols-3 sm:grid-cols-4 lg:grid-cols-5" : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5")}>
            <AnimatePresence>
              {previewUrls.map((url, index) => (
                <motion.div
                  key={files[index].name}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.2 }}
                  className="group relative aspect-square"
                >
                  <img
                    src={url}
                    alt={`Preview of ${files[index].name}`}
                    className="h-full w-full rounded-md object-cover"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute right-0 top-0 z-10 h-7 w-7 translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500 text-white opacity-100 shadow-sm transition-colors hover:bg-red-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveFile(index);
                    }}
                    aria-label={`Remove ${files[index].name}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    );
  }
);

ImageUploader.displayName = "ImageUploader";
