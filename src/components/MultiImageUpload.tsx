import { useState } from "react";
import { Upload, X, MapPin, ShieldAlert, CheckCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import exifr from "exifr";

export interface ImageWithMetadata {
  file: File;
  preview: string;
  latitude: number | null;
  longitude: number | null;
  timestamp: string | null;
  hasGPS: boolean;
  hasExif: boolean;
}

interface MultiImageUploadProps {
  images: ImageWithMetadata[];
  onImagesChange: (images: ImageWithMetadata[]) => void;
  maxImages?: number;
  minImages?: number;
}

async function extractMetadata(file: File): Promise<Omit<ImageWithMetadata, "file" | "preview">> {
  try {
    const exifData = await exifr.parse(file, {
      gps: true,
      pick: ["GPSLatitude", "GPSLongitude", "DateTimeOriginal", "CreateDate", "ModifyDate", "GPSLatitudeRef", "GPSLongitudeRef"],
    });
    if (!exifData) return { latitude: null, longitude: null, timestamp: null, hasGPS: false, hasExif: false };
    const lat = exifData.latitude ?? null;
    const lng = exifData.longitude ?? null;
    const ts = exifData.DateTimeOriginal || exifData.CreateDate || exifData.ModifyDate || null;
    return {
      latitude: lat,
      longitude: lng,
      timestamp: ts ? new Date(ts).toISOString() : null,
      hasGPS: lat !== null && lng !== null,
      hasExif: true,
    };
  } catch {
    return { latitude: null, longitude: null, timestamp: null, hasGPS: false, hasExif: false };
  }
}

export default function MultiImageUpload({ images, onImagesChange, maxImages = 10, minImages = 1 }: MultiImageUploadProps) {
  const { toast } = useToast();
  const [processing, setProcessing] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = maxImages - images.length;
    if (remaining <= 0) {
      toast({ title: "Maximum photos reached", description: `You can upload up to ${maxImages} photos.`, variant: "destructive" });
      return;
    }
    const toProcess = Array.from(files).slice(0, remaining);
    setProcessing(true);

    const newImages: ImageWithMetadata[] = [];
    for (const file of toProcess) {
      const meta = await extractMetadata(file);
      const preview = URL.createObjectURL(file);
      newImages.push({ file, preview, ...meta });

      if (!meta.hasExif) {
        toast({ title: "⚠️ No EXIF metadata", description: `"${file.name}" has no metadata and will be rejected.`, variant: "destructive" });
      } else if (!meta.hasGPS) {
        toast({ title: "⚠️ No GPS data", description: `"${file.name}" lacks GPS geo-tag and will be rejected.`, variant: "destructive" });
      }
    }

    onImagesChange([...images, ...newImages]);
    setProcessing(false);
  };

  const removeImage = (index: number) => {
    URL.revokeObjectURL(images[index].preview);
    onImagesChange(images.filter((_, i) => i !== index));
  };

  const allValid = images.length >= minImages && images.every((img) => img.hasGPS);
  const invalidCount = images.filter((img) => !img.hasGPS).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          Damage Photos <span className="text-destructive">*</span>
          <span className="text-xs text-muted-foreground font-normal ml-1">
            ({images.length}/{maxImages} • min {minImages}, all must have GPS)
          </span>
        </span>
        {images.length > 0 && allValid && (
          <span className="text-xs text-status-success font-medium flex items-center gap-1">
            <CheckCircle className="h-3 w-3" /> All photos validated
          </span>
        )}
      </div>

      {/* Image grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {images.map((img, i) => (
            <div key={i} className="relative group rounded-lg border overflow-hidden bg-muted aspect-square">
              <img src={img.preview} alt={`Damage ${i + 1}`} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removeImage(i)}
                className="absolute top-1 right-1 bg-background/80 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <div className="absolute bottom-0 left-0 right-0 bg-background/80 px-2 py-1">
                {img.hasGPS ? (
                  <span className="text-[10px] text-status-success flex items-center gap-0.5">
                    <MapPin className="h-2.5 w-2.5" /> {img.latitude?.toFixed(3)}, {img.longitude?.toFixed(3)}
                  </span>
                ) : (
                  <span className="text-[10px] text-destructive flex items-center gap-0.5">
                    <ShieldAlert className="h-2.5 w-2.5" /> {!img.hasExif ? "No EXIF" : "No GPS"} — rejected
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload area */}
      {images.length < maxImages && (
        <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/50 p-6 cursor-pointer hover:border-primary/40 transition-colors">
          {processing ? (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          ) : (
            <Upload className="h-6 w-6 text-muted-foreground" />
          )}
          <span className="text-sm text-muted-foreground text-center">
            {processing ? "Processing..." : "Click or drag to add damage photos"}
          </span>
          <span className="text-xs text-muted-foreground">All photos must have GPS metadata</span>
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </label>
      )}

      {/* Validation errors */}
      {invalidCount > 0 && (
        <Alert variant="destructive">
          <AlertDescription className="text-sm">
            <strong>{invalidCount} photo{invalidCount > 1 ? "s" : ""} rejected:</strong> Remove photos without GPS data before submitting. Only original camera photos with location enabled are accepted.
          </AlertDescription>
        </Alert>
      )}

      <p className="text-xs text-muted-foreground">
        Upload {minImages}–{maxImages} photos from different angles (front, rear, close-up, wide shot). All must be original camera photos with GPS/location enabled.
      </p>
    </div>
  );
}
