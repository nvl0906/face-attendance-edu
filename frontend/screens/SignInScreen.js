import {useState} from 'react';
import {StyleSheet, Text, View, Image, TouchableOpacity} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import CustomButton from "../components/CustomButton";
import CustomInput from "../components/CustomInput";
import useThemeStore from "../stores/useThemeStore";
import Toast from 'react-native-toast-message';
import api from "../utils/api";

export default function SignInScreen({ navigation }) {
    const c = useThemeStore((s) => s.primaryColor);
    const [loginType, setLoginType] = useState('login');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [fullname, setFullname] = useState('');
    const [loading, setLoading] = useState(false);

    const handleUsername = (text) => {
        setUsername(text);
    };

    const handleFullname = (text) => {
        setFullname(text);
    };

    const handlePassword = (text) => {
        setPassword(text);
    };
    
    const handleConfirmPassword = (text) => {
        setConfirmPassword(text);
    };

    const handleLogin = async() => {
        setLoading(true);
        try {
            const response = await api.post('/login', {
                username,
                password,
            });
            if (response.data.status === 'success') {
                Toast.show({
                    type: 'success',
                    text1: '✅ SUCCÈS!',
                    text2: response.data.message,
                    position: 'top',
                });

                await SecureStore.setItemAsync("token", response.data.token);

                navigation.reset({ 
                    index: 0, 
                    routes: [{ name: "Auth" }] 
                });
            }
            else if (response.data.status === 'error') {
                Toast.show({
                    type: 'error',
                    text1: '❌ ERREUR!',
                    text2: response.data.message,
                    position: 'top',
                });
            }
        } catch (err) {
            if (err.status === 530 || err.status === 502) {
                Toast.show({
                    type: 'error',
                    text1: '❌ SERVEUR INDISPONIBLE!',
                    text2: '❌ Veuillez réessayer ultérieurement!',
                    position: 'top',
                });
            }
            if (err.status === 422) {
                const { message, field } = err.response.data;
                Toast.show({
                    type: 'error',
                    text1: '❌ DONNÉES INVALIDES!',
                    text2: '❌ '+ message,
                    position: 'top',
                });
            }
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async() => {
        setLoading(true);
        try {
            const response = await api.post('/register', {
                fullname,
                username,
                password,
                confirmPassword,
                registertype: loginType === 'registerStudent' ? 'student' : 'institution',
            });
            if (response.data.status === 'success') {
                Toast.show({
                    type: 'success',
                    text1: '✅ SUCCÈS!',
                    text2: response.data.message,
                    position: 'top',
                });
                setLoginType('login');
            }
            else if (response.data.status === 'error') {
                Toast.show({
                    type: 'error',
                    text1: '❌ ERREUR!',
                    text2: response.data.message,
                    position: 'top',
                });
            }
        } catch (err) {
            if (err.status === 530 || err.status === 502) {
                Toast.show({
                    type: 'error',
                    text1: '❌ SERVEUR INDISPONIBLE!',
                    text2: '❌ Veuillez réessayer ultérieurement!',
                    position: 'top',
                });
            }
            if (err.status === 422) {
                const { message, field } = err.response.data;
                Toast.show({
                    type: 'error',
                    text1: '❌ DONNÉES INVALIDES!',
                    text2: '❌ '+ message,
                    position: 'top',
                });
            }
        } finally {
            setLoading(false);
        }
    };


    return (
        <View style={styles(c).container}>
            <Image source={require("../assets/icon.png")} style={styles(c).avatar} />
            {loginType === 'login' && (
                <>
                    <CustomInput placeholder="Nom d'utilisateur" onDataReceived={handleUsername} value={username}/>
                    <CustomInput type="password" placeholder="Mot de passe" onDataReceived={handlePassword} value={password}/>
                    <CustomButton title="Connexion" onPressButton={handleLogin} loading={loading}/>
                </>
            )}
            {loginType === 'registerStudent' && (
                <>
                    <CustomInput placeholder="Nom complet" onDataReceived={handleFullname} value={fullname}/>
                    <CustomInput placeholder="Nom d'utilisateur" onDataReceived={handleUsername} value={username}/>
                    <CustomInput type="password" placeholder="Mot de passe" onDataReceived={handlePassword} value={password}/>
                    <CustomInput type="password" placeholder="Confirmer le mot de passe" onDataReceived={handleConfirmPassword} value={confirmPassword}/>
                    <CustomButton title="S'inscrire" onPressButton={handleRegister} loading={loading}/>
                </>
            )}
            {loginType === 'registerInstitution' && (
                <>
                    <CustomInput placeholder="Nom de votre établissement" onDataReceived={handleFullname} value={fullname}/>
                    <CustomInput placeholder="Nom d'utilisateur" onDataReceived={handleUsername} value={username}/>
                    <CustomInput type="password" placeholder="Mot de passe" onDataReceived={handlePassword} value={password}/>
                    <CustomInput type="password" placeholder="Confirmer le mot de passe" onDataReceived={handleConfirmPassword} value={confirmPassword}/>
                    <CustomButton title="S'inscrire" onPressButton={handleRegister} loading={loading}/>
                </>
            )}
            <View style={{flexDirection: 'row', alignItems: 'center' , paddingHorizontal: 20, paddingVertical: 10, marginTop: 10}}>
                <View style={{flex: 1, height: 0.6, backgroundColor: '#585858', marginRight: 10}}/>
                    <Text>ou</Text>
                <View style={{flex: 1, height: 0.6, backgroundColor: '#585858', marginLeft: 10}}/>
            </View>
            {loginType === 'login' && (
                <>
                    <View style={styles(c).register}>
                        <Text style={styles(c).haveAccount}>Vous êtes un étudiant? </Text>
                        <TouchableOpacity onPress={() => setLoginType('registerStudent')}>
                            <Text style={styles(c).now}>Inscrivez-vous ici</Text>
                        </TouchableOpacity>
                    </View>
                    <View style={styles(c).register}>
                        <Text style={styles(c).haveAccount}>Vous êtes une établissement? </Text>
                        <TouchableOpacity onPress={() => setLoginType('registerInstitution')}>
                            <Text style={styles(c).now}>Inscrivez-vous ici</Text>
                        </TouchableOpacity>
                    </View>
                </>
            )}
            {loginType === 'registerStudent' && (
                <>
                    <View style={styles(c).register}>
                        <Text style={styles(c).haveAccount}>Vous êtes déjà inscrit? </Text>
                        <TouchableOpacity onPress={() => setLoginType('login')}>
                            <Text style={styles(c).now}>Connexion</Text>
                        </TouchableOpacity>
                    </View>
                    <View style={styles(c).register}>
                        <Text style={styles(c).haveAccount}>Vous êtes une établissement? </Text>
                        <TouchableOpacity onPress={() => setLoginType('registerInstitution')}>
                            <Text style={styles(c).now}>Inscrivez-vous ici</Text>
                        </TouchableOpacity>
                    </View>
                </>
            )}
            {loginType === 'registerInstitution' && (
                <>
                    <View style={styles(c).register}>
                        <Text style={styles(c).haveAccount}>Vous êtes déjà inscrit? </Text>
                        <TouchableOpacity onPress={() => setLoginType('login')}>
                            <Text style={styles(c).now}>Connexion</Text>
                        </TouchableOpacity>
                    </View>
                    <View style={styles(c).register}>
                        <Text style={styles(c).haveAccount}>Vous êtes étudiant? </Text>
                        <TouchableOpacity onPress={() => setLoginType('registerStudent')}>
                            <Text style={styles(c).now}>Inscrivez-vous ici</Text>
                        </TouchableOpacity>
                    </View>
                </>
            )}
        </View>
    );
}

const styles = (color="blue") => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatar: { width: '10%', height: '10%', resizeMode: 'cover' },
    title: {
        fontStyle: 'normal',
        fontWeight: '700',
        fontSize: 37,
        lineHeight: 47,
        textAlign: "left",
    },
    register: {
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        marginTop: 10,
    },
    haveAccount: {
        fontStyle: 'normal',
        fontWeight: '400',
        fontSize: 14,
        lineHeight: 20
    },
    now: {
        fontWeight: '700',
        fontSize: 12,
        lineHeight: 20,
        fontStyle: 'normal',
        color: color,
    }
});