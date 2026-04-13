import { useCallback, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Upload,
  FileSpreadsheet,
  X,
  CheckCircle2,
  AlertCircle,
  Users,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { parseExcelFile, validateExcelFile } from "@/lib/excel-parser";
import { ShiftData, ParsedScheduleResult } from "@/types/shift";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getErrorMessage } from "@/lib/getErrorMessage";
import {
  ConstraintViolation,
  validateScheduleConstraints,
} from "@/features/swaps/services/swap-constraints";

interface FileUploadZoneProps {
  onFileProcessed: (
    shifts: ShiftData[],
    employeeName?: string,
    context?: {
      sourceFile: File;
      parsedResult: ParsedScheduleResult;
      consentToShare: boolean;
    },
  ) => void;
  disabled?: boolean;
}

export function FileUploadZone({
  onFileProcessed,
  disabled,
}: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Employee selection state
  const [parsedResult, setParsedResult] = useState<ParsedScheduleResult | null>(
    null,
  );
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(
    null,
  );
  const [consentToShare, setConsentToShare] = useState(false);
  const [constraintWarningsByEmployee, setConstraintWarningsByEmployee] =
    useState<Record<string, ConstraintViolation[]>>({});
  const [pendingEmployeeId, setPendingEmployeeId] = useState<string | null>(
    null,
  );

  const toIsoDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const toIsoDateTime = (date: Date, time: string): Date => {
    const [hours = "0", minutes = "0"] = time.split(":");
    const dateTime = new Date(date);
    dateTime.setHours(Number(hours), Number(minutes), 0, 0);
    return dateTime;
  };

  const getConstraintWarnings = (shifts: ShiftData[]): ConstraintViolation[] => {
    const scheduleShifts = shifts
      .filter((shift) => Boolean(shift.startTime) && Boolean(shift.endTime))
      .map((shift) => {
        const startsAt = toIsoDateTime(shift.date, shift.startTime);
        const endsAt = toIsoDateTime(shift.date, shift.endTime);
        if (endsAt.getTime() <= startsAt.getTime()) {
          endsAt.setDate(endsAt.getDate() + 1);
        }

        return {
          date: toIsoDate(shift.date),
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
        };
      });

    return validateScheduleConstraints(scheduleShifts).violations;
  };

  const proceedWithEmployee = (employeeId: string) => {
    if (!parsedResult || !file) {
      return;
    }

    const employee = parsedResult.employees.find((e) => e.employeeId === employeeId);
    if (!employee) {
      return;
    }

    setPendingEmployeeId(null);
    onFileProcessed(employee.shifts, employee.employeeName, {
      sourceFile: file,
      parsedResult,
      consentToShare,
    });
  };

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!disabled) {
        setIsDragging(true);
      }
    },
    [disabled],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      if (disabled) return;

      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) {
        await processFile(droppedFile);
      }
    },
    [disabled],
  );

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      await processFile(selectedFile);
    }
  };

  const processFile = async (selectedFile: File) => {
    setError(null);
    setSuccess(false);
    setParsedResult(null);
    setSelectedEmployeeId(null);
    setConstraintWarningsByEmployee({});
    setPendingEmployeeId(null);

    // Validate file
    const validation = validateExcelFile(selectedFile);
    if (!validation.valid) {
      setError(validation.error || "Ficheiro inválido");
      return;
    }

    setFile(selectedFile);
    setUploading(true);
    setProgress(0);

    try {
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 100);

      // Parse Excel file
      const result = await parseExcelFile(selectedFile);

      clearInterval(progressInterval);
      setProgress(100);
      setSuccess(true);
      setParsedResult(result);

      const nextWarningsByEmployee = Object.fromEntries(
        result.employees.map((employee) => [
          employee.employeeId,
          getConstraintWarnings(employee.shifts),
        ]),
      );
      setConstraintWarningsByEmployee(nextWarningsByEmployee);

      // If only one employee, auto-select and proceed
      if (result.employees.length === 1) {
        const employee = result.employees[0];
        setSelectedEmployeeId(employee.employeeId);
        if ((nextWarningsByEmployee[employee.employeeId] ?? []).length > 0) {
          setPendingEmployeeId(employee.employeeId);
        } else {
          setTimeout(() => {
            onFileProcessed(employee.shifts, employee.employeeName, {
              sourceFile: selectedFile,
              parsedResult: result,
              consentToShare,
            });
          }, 500);
        }
      }
      // Otherwise, wait for employee selection
    } catch (err) {
      setError(getErrorMessage(err));
      setFile(null);
    } finally {
      setUploading(false);
    }
  };

  const handleEmployeeSelect = (employeeId: string) => {
    setSelectedEmployeeId(employeeId);

    const warnings = constraintWarningsByEmployee[employeeId] ?? [];
    if (warnings.length > 0) {
      setPendingEmployeeId(employeeId);
      return;
    }
    setPendingEmployeeId(null);

    proceedWithEmployee(employeeId);
  };

  const handleRemoveFile = () => {
    setFile(null);
    setError(null);
    setSuccess(false);
    setProgress(0);
    setParsedResult(null);
    setSelectedEmployeeId(null);
    setConsentToShare(false);
    setConstraintWarningsByEmployee({});
    setPendingEmployeeId(null);
  };

  // Show employee selector if multiple employees found
  const showEmployeeSelector =
    parsedResult && parsedResult.employees.length > 1 && !selectedEmployeeId;
  const pendingWarnings = pendingEmployeeId
    ? constraintWarningsByEmployee[pendingEmployeeId] ?? []
    : [];

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <FileSpreadsheet className="w-4 h-4 sm:w-5 sm:h-5" />
          Carregar Horário
        </CardTitle>
        <CardDescription className="text-sm">
          Carregue o seu ficheiro de horário de turnos Excel (.xlsx ou .xls)
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 p-4 sm:p-6">
        {disabled && (
          <Alert>
            <AlertCircle className="w-4 h-4" />
            <AlertDescription className="text-xs sm:text-sm">
              Por favor, selecione primeiro um calendário antes de carregar o
              seu horário.
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="w-4 h-4" />
            <AlertDescription className="text-xs sm:text-sm">
              {error}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex items-start gap-2 rounded-md border p-3 bg-slate-50">
          <Checkbox
            id="uploader-consent"
            checked={consentToShare}
            onCheckedChange={(checked) => setConsentToShare(Boolean(checked))}
            disabled={disabled || uploading}
          />
          <Label
            htmlFor="uploader-consent"
            className="text-xs sm:text-sm leading-relaxed"
          >
            Autorizo a partilha segura deste upload para recuperação de horário,
            sujeita a consentimento explícito do destinatário.
          </Label>
        </div>

        {!file ? (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              relative border-2 border-dashed rounded-xl p-6 sm:p-8 transition-all
              ${
                isDragging
                  ? "border-primary bg-primary/5 scale-[1.02]"
                  : "border-slate-300 bg-slate-50 hover:border-primary/50 hover:bg-slate-100"
              }
              ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
            `}
          >
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileSelect}
              disabled={disabled}
              aria-label="Selecionar ficheiro Excel de horários"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
              id="file-upload"
            />
            <div className="flex flex-col items-center gap-3 sm:gap-4 text-center">
              <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Upload className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm sm:text-base text-slate-900 mb-1">
                  {isDragging
                    ? "Solte o ficheiro aqui"
                    : "Arraste e solte o seu ficheiro Excel"}
                </p>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  ou clique para navegar
                </p>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Formatos suportados: .xlsx, .xls</p>
                <p>Tamanho máximo do ficheiro: 5MB</p>
                <p className="text-primary/80">
                  Suporta formato de horário Concentrix
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-lg p-3 sm:p-4 border border-slate-200">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 sm:gap-3 flex-1 min-w-0">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                    <FileSpreadsheet className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-xs sm:text-sm truncate">
                      {file.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                </div>
                {!uploading && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveFile}
                    className="flex-shrink-0 h-8 w-8 p-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>

              {uploading && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      A processar...
                    </span>
                    <span className="font-semibold">{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
              )}

              {success && !showEmployeeSelector && (
                <div className="mt-4 flex items-center gap-2 text-xs sm:text-sm text-green-600">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="font-semibold">
                    Ficheiro processado com sucesso!
                  </span>
                </div>
              )}
            </div>

            {/* Employee Selector */}
            {showEmployeeSelector && (
              <div className="bg-blue-50 rounded-lg p-3 sm:p-4 border border-blue-200 space-y-3">
                <div className="flex items-center gap-2 text-blue-800">
                  <Users className="w-4 h-4" />
                  <span className="font-semibold text-xs sm:text-sm">
                    Vários colaboradores encontrados (
                    {parsedResult.employees.length})
                  </span>
                </div>
                <p className="text-xs text-blue-700">
                  Selecione o colaborador cujo horário pretende sincronizar:
                </p>
                <Select onValueChange={handleEmployeeSelect}>
                  <SelectTrigger className="bg-white h-10 sm:h-auto">
                    <SelectValue placeholder="Selecione um colaborador..." />
                  </SelectTrigger>
                  <SelectContent>
                    {parsedResult.employees.map((employee) => (
                      <SelectItem
                        key={employee.employeeId}
                        value={employee.employeeId}
                      >
                        <div className="flex flex-col">
                          <span className="font-medium text-xs sm:text-sm">
                            {employee.employeeName}
                          </span>
                          {employee.lob && (
                            <span className="text-xs text-muted-foreground">
                              {employee.lob} • {employee.shifts.length} turnos
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {pendingEmployeeId && pendingWarnings.length > 0 && (
              <Alert>
                <AlertCircle className="w-4 h-4" />
                <AlertDescription className="space-y-3 text-xs sm:text-sm">
                  <p>
                    Detetamos possiveis violacoes das regras 6/60 neste horario.
                    Reveja antes de continuar:
                  </p>
                  <ul className="list-disc pl-5 space-y-1">
                    {pendingWarnings.map((violation, index) => (
                      <li key={`${violation.code}-${index}`}>{violation.message}</li>
                    ))}
                  </ul>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => proceedWithEmployee(pendingEmployeeId)}
                  >
                    Continuar mesmo assim
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            <Button
              onClick={handleRemoveFile}
              variant="outline"
              className="w-full h-10 sm:h-auto text-sm sm:text-base"
              disabled={uploading}
            >
              Carregar Ficheiro Diferente
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
