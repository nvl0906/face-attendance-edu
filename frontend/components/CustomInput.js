
import React from 'react';
import {View, StyleSheet} from "react-native";
import { FloatingLabelInput } from 'react-native-floating-label-input';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import useThemeStore from "../stores/useThemeStore";

const CustomInput = ({type = 'text', placeholder, onDataReceived, value}) => {
    const c = useThemeStore((s) => s.primaryColor);

    const handleChange = (text) => {
        onDataReceived(text);
    };

    return (
        <View style={styles.container}>
            { type === 'text' && (
            <FloatingLabelInput
                label={placeholder}
                value={value}
                onChangeText={handleChange}
                containerStyles={styles.input}
                labelStyles={{ color: c }}
                customLabelStyles={{
                    colorFocused: c,
                    fontSizeFocused: 10,
                }}
            />)}
            { type === 'password' && (
            <FloatingLabelInput
                label={placeholder}
                value={value}
                isPassword={true}
                onChangeText={handleChange}
                containerStyles={styles.input}
                labelStyles={{ color: c }}
                customLabelStyles={{
                    colorFocused: c,
                    fontSizeFocused: 10,
                }}
                customHidePasswordComponent={<MaterialCommunityIcons name="eye" size={20} color={c} />}
                customShowPasswordComponent={<MaterialCommunityIcons name="eye-off" size={20} color="#8c8686ff" />}
            />)}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '80%',
        height: 50,
        backgroundColor: '#fff',
        marginVertical: 10,
        borderRadius: 8,
        overflow: 'hidden',
        borderWidth: 1,
        borderColorFocused: '#ddd',
    },
    input: {
        borderWidth: 1, 
        borderColor: '#ddd', 
        paddingLeft: 10,
        borderRadius: 5,
        paddingRight: 10,
    },
});

export default CustomInput;
