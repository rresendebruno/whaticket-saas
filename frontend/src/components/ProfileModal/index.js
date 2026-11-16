import React, { useContext, useEffect, useState } from "react";
import Dialog from "@material-ui/core/Dialog";
import DialogTitle from "@material-ui/core/DialogTitle";
import DialogContent from "@material-ui/core/DialogContent";
import DialogContentText from "@material-ui/core/DialogContentText";
import DialogActions from "@material-ui/core/DialogActions";
import Button from "@material-ui/core/Button";
import TextField from "@material-ui/core/TextField";
import Typography from "@material-ui/core/Typography";
import CircularProgress from "@material-ui/core/CircularProgress";
import InputAdornment from "@material-ui/core/InputAdornment";
import IconButton from "@material-ui/core/IconButton";
import { Visibility, VisibilityOff } from "@material-ui/icons";
import { toast } from "react-toastify";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { AuthContext } from "../../context/Auth/AuthContext";

const MIN_PASSWORD = 5;

/**
 * Own-profile editor (name + password) for every user.
 *
 * forced = true: shown right after login when an admin required a password
 * change. It can't be closed; only "new password" is asked (the user has just
 * authenticated with the temporary one) and "Sair" logs out.
 */
const ProfileModal = ({ open, onClose, forced = false }) => {
  const { user, updateUser, handleLogout } = useContext(AuthContext);

  const [name, setName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(user?.name || "");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
  }, [open, user]);

  const changingPassword = forced || newPassword.length > 0;
  const nameChanged = !forced && name.trim() !== (user?.name || "");

  const errors = {
    name: !forced && name.trim().length < 2 ? "Informe pelo menos 2 letras" : "",
    current:
      changingPassword && !forced && !currentPassword ? "Informe a senha atual" : "",
    new:
      changingPassword && newPassword.length < MIN_PASSWORD
        ? `Mínimo de ${MIN_PASSWORD} caracteres`
        : "",
    confirm:
      changingPassword && confirmPassword !== newPassword ? "As senhas não conferem" : "",
  };
  const hasErrors = Object.values(errors).some(Boolean);
  const canSave = !saving && !hasErrors && (changingPassword || nameChanged);

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const payload = {};
      if (nameChanged) payload.name = name.trim();
      if (changingPassword) {
        payload.newPassword = newPassword;
        if (!forced) payload.currentPassword = currentPassword;
      }
      const { data } = await api.put("/profile", payload);
      updateUser(data);
      toast.success(changingPassword ? "Senha alterada com sucesso" : "Perfil atualizado");
      if (onClose) onClose();
    } catch (err) {
      toastError(err);
    }
    setSaving(false);
  };

  const passwordProps = {
    type: showPasswords ? "text" : "password",
    variant: "outlined",
    margin: "dense",
    fullWidth: true,
    InputProps: {
      endAdornment: (
        <InputAdornment position="end">
          <IconButton size="small" onClick={() => setShowPasswords(s => !s)}>
            {showPasswords ? <VisibilityOff /> : <Visibility />}
          </IconButton>
        </InputAdornment>
      ),
    },
  };

  return (
    <Dialog
      open={open}
      onClose={forced ? undefined : onClose}
      disableBackdropClick={forced}
      disableEscapeKeyDown={forced}
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle>{forced ? "Defina uma nova senha" : "Meu perfil"}</DialogTitle>
      <DialogContent dividers>
        {forced && (
          <DialogContentText>
            O administrador pediu que você troque a senha no primeiro acesso.
            Escolha uma senha nova para continuar.
          </DialogContentText>
        )}

        {!forced && (
          <>
            <TextField
              label="Nome"
              value={name}
              onChange={e => setName(e.target.value)}
              error={Boolean(errors.name)}
              helperText={errors.name}
              variant="outlined"
              margin="dense"
              fullWidth
            />
            <TextField
              label="E-mail"
              value={user?.email || ""}
              disabled
              variant="outlined"
              margin="dense"
              fullWidth
            />
            <Typography variant="caption" color="textSecondary" component="p" style={{ marginTop: 12 }}>
              Trocar senha (deixe em branco para manter a atual)
            </Typography>
            <TextField
              label="Senha atual"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              error={Boolean(errors.current)}
              helperText={errors.current}
              autoComplete="current-password"
              {...passwordProps}
            />
          </>
        )}

        <TextField
          label="Nova senha"
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
          error={Boolean(newPassword || forced) && Boolean(errors.new)}
          helperText={(newPassword || forced) ? errors.new : ""}
          autoComplete="new-password"
          autoFocus={forced}
          {...passwordProps}
        />
        <TextField
          label="Confirmar nova senha"
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
          error={Boolean(confirmPassword) && Boolean(errors.confirm)}
          helperText={confirmPassword ? errors.confirm : ""}
          autoComplete="new-password"
          onKeyDown={e => e.key === "Enter" && handleSave()}
          {...passwordProps}
        />
      </DialogContent>
      <DialogActions>
        {forced ? (
          <Button onClick={handleLogout} color="secondary" variant="outlined" disabled={saving}>
            Sair
          </Button>
        ) : (
          <Button onClick={onClose} color="secondary" variant="outlined" disabled={saving}>
            Cancelar
          </Button>
        )}
        <Button
          onClick={handleSave}
          color="primary"
          variant="contained"
          disabled={!canSave}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}
        >
          Salvar
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ProfileModal;
