import React, { useEffect, useState } from "react";
import { makeStyles } from "@material-ui/core/styles";
import Paper from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";
import Select from "@material-ui/core/Select";
import CircularProgress from "@material-ui/core/CircularProgress";
import { toast } from "react-toastify";

import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles(theme => ({
  paper: {
    padding: theme.spacing(2),
    marginBottom: 12,
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "8px 0",
    "&:not(:last-child)": {
      borderBottom: `1px solid ${theme.palette.divider}`,
    },
  },
  label: { flex: 1, minWidth: 0 },
  select: { minWidth: 190 },
}));

const AUDIENCE = [
  { value: "ALL", label: "Todos" },
  { value: "CONTACTS", label: "Meus contatos" },
  { value: "NONE", label: "Ninguém" },
];

const FIELDS = [
  { key: "photo", label: "Foto do perfil", help: "Quem pode ver a foto do perfil", options: AUDIENCE },
  { key: "lastSeen", label: "Visto por último", help: "Quem pode ver quando você esteve online pela última vez", options: AUDIENCE },
  { key: "online", label: "Online", help: "Quem pode ver quando você está online", options: [
      { value: "ALL", label: "Todos" },
      { value: "SAME_LAST_SEEN", label: "Igual ao visto por último" },
    ] },
  { key: "description", label: "Recado", help: "Quem pode ver o recado do perfil", options: AUDIENCE },
  { key: "readReceipts", label: "Confirmação de leitura", help: "Desativar também esconde quando os clientes leem as suas mensagens (sem tique azul)", options: [
      { value: "enable", label: "Ativada" },
      { value: "disable", label: "Desativada" },
    ] },
];

const WhatsappPrivacySettings = () => {
  const classes = useStyles();
  const [values, setValues] = useState({});
  const [supported, setSupported] = useState(true);
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    api
      .get("/whatsapp-privacy")
      .then(({ data }) => {
        setSupported(data.supported);
        setValues(data.values || {});
      })
      .catch(toastError);
  }, []);

  const handleChange = async (key, value) => {
    if (key === "readReceipts" && value === "disable") {
      const ok = window.confirm(
        "Ao desativar a confirmação de leitura, o sistema também deixa de mostrar quando o cliente leu suas mensagens (tique azul). Continuar?"
      );
      if (!ok) return;
    }
    const previous = values[key];
    setValues(v => ({ ...v, [key]: value }));
    setSaving(key);
    try {
      await api.put("/whatsapp-privacy", { setting: key, value });
      toast.success("Privacidade atualizada no WhatsApp");
    } catch (err) {
      setValues(v => ({ ...v, [key]: previous }));
      toastError(err);
    }
    setSaving(null);
  };

  return (
    <Paper className={classes.paper}>
      <Typography variant="subtitle1" style={{ fontWeight: 600 }}>
        Privacidade do WhatsApp
      </Typography>
      <Typography variant="caption" color="textSecondary" component="p" style={{ marginBottom: 8 }}>
        {supported
          ? "Aplica direto no número conectado. O WhatsApp não informa a configuração atual: \"Não definido\" significa que ainda não foi alterado por aqui."
          : "Disponível apenas com a conexão Z-API."}
      </Typography>

      {FIELDS.map(f => (
        <div key={f.key} className={classes.row}>
          <div className={classes.label}>
            <Typography variant="body1">{f.label}</Typography>
            <Typography variant="caption" color="textSecondary">{f.help}</Typography>
          </div>
          {saving === f.key && <CircularProgress size={18} />}
          <Select
            native
            margin="dense"
            variant="outlined"
            className={classes.select}
            value={values[f.key] || ""}
            disabled={!supported || saving !== null}
            onChange={e => handleChange(f.key, e.target.value)}
          >
            {!values[f.key] && <option value="">Não definido</option>}
            {f.options.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </div>
      ))}
    </Paper>
  );
};

export default WhatsappPrivacySettings;
