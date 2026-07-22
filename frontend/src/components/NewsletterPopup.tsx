import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Dialog, DialogHeader, DialogTitle, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const LS_KEY = "resk_newsletter_dismissed";

export function NewsletterPopup() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (localStorage.getItem(LS_KEY)) return;
    const timer = setTimeout(() => setOpen(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  function dismiss() {
    localStorage.setItem(LS_KEY, "true");
    setOpen(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr("");
    try {
      await api.post("/api/newsletter/subscribe", { name, email, company: company || null });
      setDone(true);
      localStorage.setItem(LS_KEY, "true");
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      <DialogHeader>
        <DialogTitle>{done ? "Inscrit ! 🎉" : "Restez informé"}</DialogTitle>
      </DialogHeader>
      <DialogContent>
        {done ? (
          <div className="space-y-3 text-center py-4">
            <p className="text-sm text-muted-foreground">
              Merci {name} ! Vous êtes sur la liste d'attente ReskLayer.
              Vous recevrez les prochaines actualités sur {email}.
            </p>
            <Button onClick={dismiss}>Fermer</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              ReskLayer arrive bientôt. Soyez parmi les premiers informés des mises à jour,
              nouvelles fonctionnalités et bonnes pratiques de sécurité LLM.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="nl-name">Nom *</Label>
              <Input id="nl-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nl-email">Email *</Label>
              <Input id="nl-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nl-company">Entreprise</Label>
              <Input id="nl-company" value={company} onChange={(e) => setCompany(e.target.value)} />
            </div>
            {err && <div className="text-destructive text-sm">{err}</div>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={dismiss}>Plus tard</Button>
              <Button type="submit" disabled={loading}>{loading ? "…" : "Je m'inscris"}</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
