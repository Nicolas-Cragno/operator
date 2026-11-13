import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Alert, Button, Icon, LoadingState, useCantappTheme } from 'cantapp-components';
import { readPendingRecord } from '../services/record.service';

export default function CreationMenu({ groups, uid, onSelect, onClose }) {
  const theme = useCantappTheme();
  const { width } = useWindowDimensions();
  const columns = width >= 1024 ? 4 : width >= 768 ? 3 : 2;
  const menuWidth = columns === 4 ? 880 : columns === 3 ? 680 : 420;
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let active = true;
    setState({ loading: true });
    if (!uid) { setState({ error: 'La sesión no está disponible.' }); return; }
    readPendingRecord(uid).then(pending => {
      if (active) setState({ pending });
    }).catch(error => { if (active) setState({ error: error.message }); });
    return () => { active = false; };
  }, [uid]);
  return <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <View style={{ flex: 1, backgroundColor: 'rgba(11,20,40,0.6)' }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Cerrar menú de creación" onPress={onClose}
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
      <SafeAreaView pointerEvents="box-none" edges={['top', 'bottom', 'left', 'right']}
        style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'flex-end', padding: 16 }}>
        <View accessibilityViewIsModal onAccessibilityEscape={onClose}
          style={{ width: '100%', maxWidth: menuWidth, maxHeight: '80%', backgroundColor: theme.surface,
            borderColor: theme.border, borderWidth: 1, borderRadius: 16, overflow: 'hidden', flexShrink: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 }}>
            <Text accessibilityRole="header" style={{ flex: 1, color: theme.text, fontSize: 20, fontWeight: '700' }}>Crear nuevo</Text>
            <Button label="Cerrar" variant="ghost" onPress={onClose} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }} contentContainerStyle={{ padding: 12, gap: 24 }}>
            {state.loading ? <LoadingState label="Verificando acciones disponibles…" /> : state.error ?
              <Alert tone="warning" title="No se puede iniciar un alta" description={state.error} /> : state.pending ?
                <Alert tone="warning" title="Hay un guardado pendiente" description="Revisá la solicitud pendiente desde su módulo antes de crear otro registro." /> :
                groups.map(group => <View key={group.id} style={{ gap: 12 }}>
                  <Text accessibilityRole="header" style={{ color: theme.text, fontWeight: '700', fontSize: 16 }}>{group.label}</Text>
                  {Array.from({ length: Math.ceil(group.actions.length / columns) }, (_, row) => (
                    <View key={row} style={{ flexDirection: 'row', alignItems: 'stretch', gap: 12 }}>
                      {Array.from({ length: columns }, (_, column) => {
                        const action = group.actions[row * columns + column];
                        return action ? <Pressable key={action.key} accessibilityRole="button" accessibilityLabel={action.label}
                          onPress={() => onSelect(action.key)}
                          style={({ pressed, hovered, focused }) => ({
                            flex: 1, minWidth: 0, minHeight: 148, padding: 14, gap: 12,
                            alignItems: 'center', justifyContent: 'center', borderRadius: 14,
                            borderWidth: focused ? 2 : 1, borderColor: focused ? theme.primary : theme.border,
                            backgroundColor: pressed || hovered ? theme.selection || theme.surface : theme.surface,
                            opacity: pressed ? 0.8 : 1,
                          })}>
                          <View style={{ width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.selection || theme.surface }}>
                            <Icon name="plus" size={28} color={theme.primary} />
                          </View>
                          <Text style={{ color: theme.text, fontWeight: '600', fontSize: 14, lineHeight: 20, textAlign: 'center', width: '100%', flexShrink: 1 }}>{action.label}</Text>
                        </Pressable> : <View key={`empty-${column}`} style={{ flex: 1, minWidth: 0 }} />;
                      })}
                    </View>
                  ))}
                </View>)}
            {!state.loading && !state.error && !state.pending && !groups.length && <Text style={{ color: theme.muted }}>No hay acciones de creación habilitadas.</Text>}
          </ScrollView>
        </View>
      </SafeAreaView>
    </View>
  </Modal>;
}
