import React, { useState, useEffect } from "react";
import {
  makeStyles,
  Paper,
  Typography,
  Switch,
  FormControlLabel,
  TextField,
  Button,
  IconButton,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Divider,
  CircularProgress,
} from "@material-ui/core";
import AddCircleOutlineIcon from "@material-ui/icons/AddCircleOutline";
import DeleteOutlineIcon from "@material-ui/icons/DeleteOutline";
import { toast } from "react-toastify";

import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import MainContainer from "../../components/MainContainer";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles((theme) => ({
  mainPaper: {
    flex: 1,
    padding: theme.spacing(3),
    overflowY: "scroll",
    ...theme.scrollbarStyles,
  },
  section: {
    marginBottom: theme.spacing(3),
  },
  optionRow: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(2),
    marginBottom: theme.spacing(1),
  },
  optionNumber: {
    width: 80,
  },
  optionTitle: {
    flex: 1,
  },
  optionQueue: {
    flex: 1,
  },
  addButton: {
    marginTop: theme.spacing(1),
  },
  saveButton: {
    marginTop: theme.spacing(2),
  },
  hint: {
    color: theme.palette.text.secondary,
    fontSize: "0.82em",
    marginTop: 4,
    marginBottom: theme.spacing(1),
  },
}));

const Chatbot = () => {
  const classes = useStyles();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [queues, setQueues] = useState([]);
  const [enabled, setEnabled] = useState(false);
  const [greetingMessage, setGreetingMessage] = useState("");
  const [options, setOptions] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [chatbotRes, queuesRes] = await Promise.all([
          api.get("/chatbot"),
          api.get("/queue"),
        ]);
        const data = chatbotRes.data;
        setEnabled(data.enabled || false);
        setGreetingMessage(data.greetingMessage || "");
        setOptions(
          (data.options || []).map((opt) => ({
            id: opt.id,
            option: opt.option,
            title: opt.title,
            queueId: opt.queueId || "",
          }))
        );
        setQueues(queuesRes.data || []);
      } catch (err) {
        toastError(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleAddOption = () => {
    const nextNumber = String(options.length + 1);
    setOptions([...options, { option: nextNumber, title: "", queueId: "" }]);
  };

  const handleRemoveOption = (index) => {
    const updated = options.filter((_, i) => i !== index);
    // Re-number options sequentially
    setOptions(updated.map((opt, i) => ({ ...opt, option: String(i + 1) })));
  };

  const handleOptionChange = (index, field, value) => {
    setOptions(options.map((opt, i) => (i === index ? { ...opt, [field]: value } : opt)));
  };

  const handleSave = async () => {
    if (enabled && !greetingMessage.trim()) {
      toast.error("Informe a mensagem de boas-vindas.");
      return;
    }
    if (enabled && options.length === 0) {
      toast.error("Adicione ao menos uma opção de fila.");
      return;
    }
    if (enabled && options.some((opt) => !opt.title.trim() || !opt.queueId)) {
      toast.error("Preencha o título e a fila de todas as opções.");
      return;
    }

    setSaving(true);
    try {
      await api.put("/chatbot", {
        enabled,
        greetingMessage,
        options: options.map((opt) => ({
          option: opt.option,
          title: opt.title,
          queueId: opt.queueId || null,
        })),
      });
      toast.success("Chatbot salvo com sucesso!");
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <MainContainer>
        <MainHeader>
          <Title>Chatbot / URA</Title>
        </MainHeader>
        <Paper className={classes.mainPaper}>
          <CircularProgress />
        </Paper>
      </MainContainer>
    );
  }

  return (
    <MainContainer>
      <MainHeader>
        <Title>Chatbot / URA</Title>
        <MainHeaderButtonsWrapper>
          <Button
            variant="contained"
            color="primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <CircularProgress size={20} color="inherit" /> : "Salvar"}
          </Button>
        </MainHeaderButtonsWrapper>
      </MainHeader>

      <Paper className={classes.mainPaper}>
        <div className={classes.section}>
          <FormControlLabel
            control={
              <Switch
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                color="primary"
              />
            }
            label={enabled ? "Chatbot ativo" : "Chatbot inativo"}
          />
          <Typography className={classes.hint}>
            Quando ativo, o chatbot envia o menu automaticamente para contatos que ainda não têm fila atribuída.
          </Typography>
        </div>

        <Divider />

        <div className={classes.section} style={{ marginTop: 16 }}>
          <TextField
            label="Mensagem de boas-vindas"
            multiline
            minRows={3}
            fullWidth
            variant="outlined"
            value={greetingMessage}
            onChange={(e) => setGreetingMessage(e.target.value)}
            placeholder="Ex: Olá! Seja bem-vindo. Por favor, escolha uma das opções abaixo:"
          />
          <Typography className={classes.hint}>
            Essa mensagem aparece acima das opções do menu. Para até 3 opções, será enviada como botões do WhatsApp; acima disso, como lista.
          </Typography>
        </div>

        <Divider />

        <div className={classes.section} style={{ marginTop: 16 }}>
          <Typography variant="subtitle1" gutterBottom>
            <strong>Opções do menu</strong>
          </Typography>

          {options.map((opt, index) => (
            <div key={index} className={classes.optionRow}>
              <TextField
                className={classes.optionNumber}
                label="Nº"
                variant="outlined"
                size="small"
                value={opt.option}
                onChange={(e) => handleOptionChange(index, "option", e.target.value)}
              />
              <TextField
                className={classes.optionTitle}
                label="Título da opção"
                variant="outlined"
                size="small"
                value={opt.title}
                onChange={(e) => handleOptionChange(index, "title", e.target.value)}
                placeholder="Ex: Suporte Técnico"
              />
              <FormControl variant="outlined" size="small" className={classes.optionQueue}>
                <InputLabel>Fila</InputLabel>
                <Select
                  value={opt.queueId}
                  onChange={(e) => handleOptionChange(index, "queueId", e.target.value)}
                  label="Fila"
                >
                  <MenuItem value=""><em>Selecione...</em></MenuItem>
                  {queues.map((q) => (
                    <MenuItem key={q.id} value={q.id}>
                      <span
                        style={{
                          display: "inline-block",
                          width: 12,
                          height: 12,
                          borderRadius: "50%",
                          backgroundColor: q.color,
                          marginRight: 8,
                        }}
                      />
                      {q.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <IconButton size="small" onClick={() => handleRemoveOption(index)}>
                <DeleteOutlineIcon color="error" />
              </IconButton>
            </div>
          ))}

          <Button
            className={classes.addButton}
            startIcon={<AddCircleOutlineIcon />}
            onClick={handleAddOption}
            color="primary"
          >
            Adicionar opção
          </Button>
        </div>
      </Paper>
    </MainContainer>
  );
};

export default Chatbot;
