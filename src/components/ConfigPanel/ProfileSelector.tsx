import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWorkspaceStore } from "@/store/workspace";
import { Save, Plus, Trash2 } from "lucide-react";

export function ProfileSelector() {
  const profiles = useWorkspaceStore((s) => s.profiles);
  const activeProfileId = useWorkspaceStore((s) => s.activeProfileId);
  const loadProfile = useWorkspaceStore((s) => s.loadProfile);
  const createProfile = useWorkspaceStore((s) => s.createProfile);
  const saveCurrentToProfile = useWorkspaceStore((s) => s.saveCurrentToProfile);
  const deleteProfile = useWorkspaceStore((s) => s.deleteProfile);

  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const handleCreate = () => {
    if (!newName.trim()) return;
    createProfile(newName.trim(), newDescription.trim() || undefined);
    setNewName("");
    setNewDescription("");
    setNewDialogOpen(false);
  };

  const handleSave = () => {
    if (activeProfileId) {
      saveCurrentToProfile(activeProfileId);
    }
  };

  const handleDelete = () => {
    if (activeProfileId) {
      deleteProfile(activeProfileId);
    }
  };

  const activeProfile = profiles.find((p) => p.id === activeProfileId);
  const isDefaultProfile = activeProfileId?.startsWith("tiktok") ||
    activeProfileId?.startsWith("youtube") ||
    activeProfileId?.startsWith("instagram");

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Select
          value={activeProfileId ?? "none"}
          onValueChange={(v) => v !== "none" && loadProfile(v)}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Seleccionar perfil" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">
              <span className="text-muted-foreground">Sin perfil</span>
            </SelectItem>
            {profiles.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                <div className="flex flex-col">
                  <span>{p.name}</span>
                  {p.description && (
                    <span className="text-xs text-muted-foreground">
                      {p.description}
                    </span>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setNewDialogOpen(true)}
          title="Nuevo perfil"
        >
          <Plus className="h-4 w-4" />
        </Button>

        {activeProfileId && !isDefaultProfile && (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSave}
              title="Guardar cambios al perfil"
            >
              <Save className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDelete}
              title="Eliminar perfil"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>

      {activeProfile && (
        <p className="text-xs text-muted-foreground">
          {activeProfile.description}
        </p>
      )}

      <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo Perfil</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="profile-name">Nombre</Label>
              <Input
                id="profile-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Mi perfil personalizado"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-description">Descripcion (opcional)</Label>
              <Input
                id="profile-description"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Descripcion breve del perfil"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={!newName.trim()}>
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
